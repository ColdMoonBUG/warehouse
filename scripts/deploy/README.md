# 上线 / 回退手册（生产 Linux 机器）

工具：`scripts/deploy/warehouse.sh`。下面的命令都用 `bash 路径/warehouse.sh` 执行（从 Windows 提交的脚本没有可执行权限，用 bash 调用最稳）。

## 这次上线会变什么、不变什么

- 后端从 `./mvnw spring-boot:run`（开发模式，带热重载）改成运行构建好的 jar；管理端从 vite 开发服务器改成构建好的静态文件，仍然是 5173 端口、仍然把 `/api` 转给 8888。访问地址、端口、App 里的服务器地址都不变。
- 原来的目录（下文叫“主目录”，例如 `/home/bug/CODE/ERP/warehouse`）里的代码和 `run-check.sh` 一个字都不动，回退时直接按原来的方式启动。
- 数据库只加 7 个索引（不改表结构、不改数据），老版本照样能用现在的库，回退不需要恢复数据库。
- 启动后的进程脱离终端运行，关掉 SSH 窗口不会把服务带走。

## 第一次上线

0. 确认有 `mysqldump`（部署前要备份数据库）：`mysqldump --version`，没有就 `sudo apt install mysql-client`。

1. 把新版本代码放到主目录旁边（不影响正在运行的老版本）：

   ```bash
   cd /home/bug/CODE/ERP/warehouse
   git fetch origin
   git worktree add ../warehouse-next origin/<新版本分支>
   ```

   **不要在主目录里 `git pull`**：老方式是开发模式，vite 会立刻把新页面推给正在用的浏览器（新页面 + 老后端），主目录还要留着做回退。

2. 构建（老版本照常运行，随时可以做）：

   ```bash
   bash ../warehouse-next/scripts/deploy/warehouse.sh build
   ```

3. 部署（挑没人开单的时候，服务中断 10 秒到 1 分钟）：

   ```bash
   bash ../warehouse-next/scripts/deploy/warehouse.sh deploy
   ```

   依次执行：备份数据库 → 加索引 → 停掉老服务 → 启动新版本 → 自检（后端接口、管理端首页、管理端到后端的转发）。自检不通过会**自动恢复成原来的方式**，并把日志打包好。

4. 查看状态：`bash ../warehouse-next/scripts/deploy/warehouse.sh status`

5. 上线后在管理端和 App 上各点一遍：销售单列表翻页、单据查询搜一个单号、打开一张带退单的销单看关联、App 销退页、开一张单。

6. App：用 HBuilderX 打包新版（版本号 1.2.0，内部版本号保持 135，需要时可以直接覆盖安装回老 APK）。新 App 连老后端、老 App 连新后端都能正常用，所以不用和后端同时换，建议后端先上、确认没问题再发 App。

## 回退

```bash
bash ../warehouse-next/scripts/deploy/warehouse.sh rollback
```

- 第一次上线后执行 = 回到原来的方式（主目录代码 + `run-check.sh`），不用改数据库。
- 再执行一次 `rollback` 又回到新版本（在“当前”和“上一个”之间切换）。
- 直接指定：`rollback legacy`（原来的方式）或 `rollback <发布包名>`（`list` 可以看到所有发布包）。

## 出问题时发回什么

```bash
bash ../warehouse-next/scripts/deploy/warehouse.sh logs      # 默认最近 3 天，logs 7 = 最近 7 天
```

生成 `~/warehouse-logs-时间.tar.gz`，把这个文件发回来。里面有：

- `warehouse.log`：新版后端日志。每个出错的请求都有一个“错误编号”，用户看到的提示里也带着同一个编号，告诉我们编号就能直接定位；超过 1.5 秒的慢请求会记一条 `api.slow`。
- `backend.log` / `admin-web.log`：后端和管理端的控制台输出。
- `deploy.log`：每次 build / deploy / rollback 的完整过程。
- `status.txt`、`errors-summary.txt`：当时的运行状态和报错摘要。

部署失败自动恢复时会自动打一个包，路径会打印在最后一行。

## 以后再发版

```bash
cd /home/bug/CODE/ERP/warehouse-next
git fetch origin && git checkout --detach origin/<分支>
bash scripts/deploy/warehouse.sh build
bash scripts/deploy/warehouse.sh deploy
```

这时 `rollback` 回到上一个发布包，大约 10 秒。

## 其他命令

| 命令 | 作用 |
| --- | --- |
| `status` | 正在运行的版本、健康检查、最近一次备份 |
| `list` | 已构建的发布包（标出当前和上一个） |
| `stop` / `start` | 停止 / 启动当前版本（电脑重启后用 `start`） |
| `backup` | 只备份数据库 |
| `build <git版本>` | 构建指定版本，例如 `build 5e9edf3` 把老版本也做成发布包 |

## 文件位置

- 发布包：`~/warehouse-deploy/releases/`（保留最近 5 个，外加当前和上一个）
- 部署前的数据库备份：`~/warehouse-deploy/db-backups/`（保留最近 20 个）
- 日志：主目录 `logs/`（`warehouse.log` 按 20MB 滚动、保留 14 天、总共不超过 500MB）
- 后端每天凌晨的自动备份照旧在主目录 `backup/`

## 恢复数据库（只有数据被改坏时才需要，回退版本不需要）

```bash
gunzip < ~/warehouse-deploy/db-backups/warehouse_时间.sql.gz | mysql -u warehouse -p warehouse
```

会覆盖备份之后录入的所有单据，执行前先停服务（`stop`）并确认。

## 历史数据体检

`sql/diagnostics/20261007_data_check.sql` 只读，列出老版本留下的问题数据（作废销单仍挂着有效退单、疑似重复提交的销单、长期草稿），人工核对后再处理：

```bash
mysql -u warehouse -p warehouse < ../warehouse-next/sql/diagnostics/20261007_data_check.sql > 体检结果.txt
```

## 常见问题

- **当前 java 不是 JDK 8**：和 `run-check.sh` 一样需要 JDK 8，或者 `JAVA_BIN=/JDK8路径/bin/java bash ... deploy`。
- **端口被占用但看不到进程**：可能是别的用户或 root 启动的，先手动停掉再执行。
- **数据库连接**：自动读取主目录的 `application.yml`；生产机上的连接配置和代码里不一样时，会自动生成 `~/warehouse-deploy/config/application.yml` 让新版本沿用生产机的配置。
