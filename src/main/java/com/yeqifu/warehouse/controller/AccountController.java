package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.Account;
import com.yeqifu.warehouse.mapper.AccountMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/account")
@CrossOrigin
public class AccountController {

    @Autowired
    private AccountMapper accountMapper;

    @GetMapping("/list")
    public Result<List<Account>> list() {
        List<Account> list = accountMapper.selectList(
            new LambdaQueryWrapper<Account>().eq(Account::getStatus, "active")
        );
        return Result.ok(list);
    }

    @PostMapping("/login")
    public Result<Account> login(@RequestBody Account req) {
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
        return Result.ok(account);
    }

    @PostMapping("/save")
    public Result<Void> save(@RequestBody Account account) {
        if (account.getId() == null) {
            accountMapper.insert(account);
        } else {
            accountMapper.updateById(account);
        }
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
        accountMapper.deleteById(id);
        return Result.ok();
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
