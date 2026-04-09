# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

### 后端（Spring Boot / Maven）
- 启动后端：`./mvnw spring-boot:run`
- 使用脚本联动启动（后端 + admin-web + API 探测）：`run-check.bat`

### 管理端（apps/admin-web）
- 安装依赖：`pnpm -C apps/admin-web install`（或 `npm -C apps/admin-web install`）
- 本地开发：`pnpm -C apps/admin-web dev -- --host 0.0.0.0`
- 构建：`pnpm -C apps/admin-web build`
- Lint：`pnpm -C apps/admin-web lint`
- 格式化：`pnpm -C apps/admin-web format`

### 快速启动管理端（Windows）
- `start-admin-web.bat`（自动启动并打开浏览器）

## 高层架构与结构

- **后端（Spring Boot）**：位于 `src/`，典型 Ruoyi 结构，业务接口以 `/api/*` 形式提供。
- **管理端（Vue3 + Vite）**：位于 `apps/admin-web/`，前端以 mock（localStorage）为主，后端接口逐步对齐。
- **移动端（uni-app）**：位于 `apps/mobile-app/`，与 admin-web 的类型与 mock 数据结构保持一致，API 封装集中在 `apps/mobile-app/src/api/`。
- **SQL**：`sql/warehouse_schema.sql` 与根目录 `warehouse.sql` 用于数据库结构初始化/参考。

## 关键约定

- admin-web 的脚本命令定义在 `apps/admin-web/package.json`。
- 本仓库同时包含前端与后端；前端优先 mock，后端逐步补齐接口。