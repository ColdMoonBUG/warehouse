package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.Account;
import com.yeqifu.warehouse.mapper.AccountMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpSession;
import java.util.List;

@RestController
@RequestMapping("/api/account")
@CrossOrigin(origins = "*", allowCredentials = "true")
public class AccountController {

    @Autowired
    private AccountMapper accountMapper;

    @GetMapping("/list")
    public Result<List<Account>> list(@RequestParam(required = false) String role,
                                      @RequestParam(required = false, defaultValue = "false") boolean includeInactive) {
        LambdaQueryWrapper<Account> wrapper = new LambdaQueryWrapper<>();
        if (!includeInactive) {
            wrapper.eq(Account::getStatus, "active");
        }
        if (role != null && !role.isEmpty()) {
            wrapper.eq(Account::getRole, role);
        }
        List<Account> list = accountMapper.selectList(wrapper.orderByAsc(Account::getCreatedAt));
        return Result.ok(list);
    }

    @PostMapping("/login")
    public Result<Account> login(@RequestBody Account req, HttpSession session) {
        Account account = accountMapper.selectOne(
            new LambdaQueryWrapper<Account>()
                .eq(Account::getUsername, req.getUsername())
                .eq(Account::getStatus, "active")
        );
        if (account == null) {
            return Result.error("账户不存在或已停用");
        }
        if (!account.getPasswordHash().equals(req.getPasswordHash())) {
            return Result.error("密码错误");
        }
        saveAccountSession(session, account);
        return Result.ok(account);
    }

    @PostMapping("/loginByGesture")
    public Result<Account> loginByGesture(@RequestBody Account req, HttpSession session) {
        Account account = accountMapper.selectOne(
            new LambdaQueryWrapper<Account>()
                .eq(Account::getUsername, req.getUsername())
                .eq(Account::getStatus, "active")
        );
        if (account == null) {
            return Result.error("账户不存在或已停用");
        }
        if (account.getGestureHash() == null || account.getGestureHash().isEmpty()) {
            return Result.error("账户未设置手势密码");
        }
        if (!account.getGestureHash().equals(req.getGestureHash())) {
            return Result.error("手势密码错误");
        }
        saveAccountSession(session, account);
        return Result.ok(account);
    }

    @PostMapping("/logout")
    public Result<Void> logout(HttpSession session) {
        session.invalidate();
        return Result.ok();
    }

    @GetMapping("/current")
    public Result<Account> current(HttpSession session) {
        Object accountId = session.getAttribute("warehouseAccountId");
        if (!(accountId instanceof String)) {
            return Result.error("未登录");
        }
        Account account = accountMapper.selectById((String) accountId);
        if (account == null || !"active".equals(account.getStatus())) {
            return Result.error("账户不存在或已停用");
        }
        return Result.ok(account);
    }

    private void saveAccountSession(HttpSession session, Account account) {
        session.setAttribute("warehouseAccountId", account.getId());
        session.setAttribute("warehouseAccountRole", account.getRole());
        session.setAttribute("warehouseAccountName", account.getDisplayName());
    }

    @PostMapping("/save")
    public Result<Void> save(@RequestBody Account account) {
        if (account.getId() == null || account.getId().isEmpty()) {
            return Result.error("系统仅允许维护固定账户");
        }
        Account current = accountMapper.selectById(account.getId());
        if (current == null) {
            return Result.error("账户不存在");
        }
        if (account.getStatus() != null && !account.getStatus().isEmpty()) {
            current.setStatus(account.getStatus());
        }
        if (account.getPasswordHash() != null && !account.getPasswordHash().isEmpty()) {
            current.setPasswordHash(account.getPasswordHash());
        }
        if (account.getGestureHash() != null && !account.getGestureHash().isEmpty()) {
            current.setGestureHash(account.getGestureHash());
        }
        accountMapper.updateById(current);
        return Result.ok();
    }

    @PostMapping("/toggle/{id}")
    public Result<Void> toggle(@PathVariable String id) {
        Account account = accountMapper.selectById(id);
        if (account != null) {
            account.setStatus("active".equals(account.getStatus()) ? "inactive" : "active");
            accountMapper.updateById(account);
        }
        return Result.ok();
    }

    @PostMapping("/delete/{id}")
    public Result<Void> delete(@PathVariable String id) {
        return Result.error("系统仅保留固定账户，不允许删除");
    }

    @PostMapping("/setGesture")
    public Result<Void> setGesture(@RequestBody Account req) {
        Account account = accountMapper.selectById(req.getId());
        if (account != null) {
            account.setGestureHash(req.getGestureHash());
            accountMapper.updateById(account);
        }
        return Result.ok();
    }

    @PostMapping("/setPassword")
    public Result<Void> setPassword(@RequestBody Account req) {
        Account account = accountMapper.selectById(req.getId());
        if (account != null) {
            account.setPasswordHash(req.getPasswordHash());
            accountMapper.updateById(account);
        }
        return Result.ok();
    }
}
