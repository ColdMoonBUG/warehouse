package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.yeqifu.warehouse.common.IdUtils;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.Account;
import com.yeqifu.warehouse.entity.CommissionLedger;
import com.yeqifu.warehouse.entity.CommissionSettlement;
import com.yeqifu.warehouse.mapper.AccountMapper;
import com.yeqifu.warehouse.mapper.CommissionLedgerMapper;
import com.yeqifu.warehouse.mapper.CommissionSettlementMapper;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpSession;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/finance/commission")
@CrossOrigin
public class FinanceController {

    @Autowired
    private AccountMapper accountMapper;

    @Autowired
    private CommissionLedgerMapper commissionLedgerMapper;

    @Autowired
    private CommissionSettlementMapper commissionSettlementMapper;

    @GetMapping("/summary")
    public Result<List<CommissionSummaryVO>> summary(HttpSession session) {
        Result<List<CommissionSummaryVO>> auth = rejectIfNotAdmin(session);
        if (auth != null) {
            return auth;
        }
        List<Account> salespersons = listSalespersons();
        List<CommissionSettlement> settlements = commissionSettlementMapper.selectList(
            new LambdaQueryWrapper<CommissionSettlement>().orderByDesc(CommissionSettlement::getCreatedAt)
        );
        Map<String, CommissionSettlement> latestSettlementMap = new LinkedHashMap<>();
        for (CommissionSettlement settlement : settlements) {
            latestSettlementMap.putIfAbsent(settlement.getSalespersonId(), settlement);
        }
        List<CommissionSummaryVO> result = new ArrayList<>();
        for (Account salesperson : salespersons) {
            List<CommissionLedger> unsettledLedgers = listUnsettledLedgers(salesperson.getId());
            CommissionSummaryVO item = buildSummary(salesperson, unsettledLedgers);
            CommissionSettlement latest = latestSettlementMap.get(salesperson.getId());
            if (latest != null) {
                item.setLastSettlementId(latest.getId());
                item.setLastSettlementAt(latest.getCreatedAt());
                item.setLastSettlementAmount(defaultAmount(latest.getTotalAmount()));
            }
            result.add(item);
        }
        return Result.ok(result);
    }

    @GetMapping("/unsettled")
    public Result<List<CommissionLedger>> unsettled(@RequestParam String salespersonId, HttpSession session) {
        Result<List<CommissionLedger>> auth = rejectIfNotAdmin(session);
        if (auth != null) {
            return auth;
        }
        return Result.ok(listUnsettledLedgers(salespersonId));
    }

    @GetMapping("/settlements")
    public Result<List<CommissionSettlementVO>> settlements(HttpSession session) {
        Result<List<CommissionSettlementVO>> auth = rejectIfNotAdmin(session);
        if (auth != null) {
            return auth;
        }
        Map<String, String> accountNameMap = accountMapper.selectList(new LambdaQueryWrapper<Account>())
            .stream()
            .collect(Collectors.toMap(Account::getId, Account::getDisplayName, (left, right) -> left, LinkedHashMap::new));
        List<CommissionSettlementVO> result = commissionSettlementMapper.selectList(
            new LambdaQueryWrapper<CommissionSettlement>().orderByDesc(CommissionSettlement::getCreatedAt)
        ).stream().map(item -> {
            CommissionSettlementVO vo = new CommissionSettlementVO();
            vo.setId(item.getId());
            vo.setSalespersonId(item.getSalespersonId());
            vo.setSalespersonName(accountNameMap.getOrDefault(item.getSalespersonId(), item.getSalespersonId()));
            vo.setSettledBy(item.getSettledBy());
            vo.setSettledByName(accountNameMap.getOrDefault(item.getSettledBy(), item.getSettledBy()));
            vo.setSaleAmount(defaultAmount(item.getSaleAmount()));
            vo.setReturnAmount(defaultAmount(item.getReturnAmount()));
            vo.setTotalAmount(defaultAmount(item.getTotalAmount()));
            vo.setLedgerCount(item.getLedgerCount() == null ? 0 : item.getLedgerCount());
            vo.setRemark(item.getRemark());
            vo.setCreatedAt(item.getCreatedAt());
            return vo;
        }).collect(Collectors.toList());
        return Result.ok(result);
    }

    @GetMapping("/settlement/{id}")
    public Result<CommissionSettlementDetailVO> settlementDetail(@PathVariable String id, HttpSession session) {
        Result<CommissionSettlementDetailVO> auth = rejectIfNotAdmin(session);
        if (auth != null) {
            return auth;
        }
        CommissionSettlement settlement = commissionSettlementMapper.selectById(id);
        if (settlement == null) {
            return Result.error("结清记录不存在");
        }
        Map<String, String> accountNameMap = accountMapper.selectList(new LambdaQueryWrapper<Account>())
            .stream()
            .collect(Collectors.toMap(Account::getId, Account::getDisplayName, (left, right) -> left, LinkedHashMap::new));
        CommissionSettlementDetailVO detail = new CommissionSettlementDetailVO();
        CommissionSettlementVO head = new CommissionSettlementVO();
        head.setId(settlement.getId());
        head.setSalespersonId(settlement.getSalespersonId());
        head.setSalespersonName(accountNameMap.getOrDefault(settlement.getSalespersonId(), settlement.getSalespersonId()));
        head.setSettledBy(settlement.getSettledBy());
        head.setSettledByName(accountNameMap.getOrDefault(settlement.getSettledBy(), settlement.getSettledBy()));
        head.setSaleAmount(defaultAmount(settlement.getSaleAmount()));
        head.setReturnAmount(defaultAmount(settlement.getReturnAmount()));
        head.setTotalAmount(defaultAmount(settlement.getTotalAmount()));
        head.setLedgerCount(settlement.getLedgerCount() == null ? 0 : settlement.getLedgerCount());
        head.setRemark(settlement.getRemark());
        head.setCreatedAt(settlement.getCreatedAt());
        detail.setSettlement(head);
        detail.setLedgers(commissionLedgerMapper.selectList(
            new LambdaQueryWrapper<CommissionLedger>()
                .eq(CommissionLedger::getSettlementId, id)
                .orderByAsc(CommissionLedger::getCreatedAt)
        ));
        return Result.ok(detail);
    }

    @PostMapping("/settle")
    @Transactional
    public Result<CommissionSettlementVO> settle(@RequestBody CommissionSettleRequest req, HttpSession session) {
        Result<CommissionSettlementVO> auth = rejectIfNotAdmin(session);
        if (auth != null) {
            return auth;
        }
        if (req == null || req.getSalespersonId() == null || req.getSalespersonId().isEmpty()) {
            return Result.error("请选择要结清的业务员");
        }
        Account salesperson = accountMapper.selectById(req.getSalespersonId());
        if (salesperson == null || !"salesperson".equals(salesperson.getRole())) {
            return Result.error("业务员不存在");
        }
        List<CommissionLedger> ledgers = listUnsettledLedgers(req.getSalespersonId());
        if (ledgers.isEmpty()) {
            return Result.error("当前没有可结清的未结提成");
        }
        BigDecimal saleAmount = BigDecimal.ZERO;
        BigDecimal returnAmount = BigDecimal.ZERO;
        for (CommissionLedger ledger : ledgers) {
            BigDecimal amount = defaultAmount(ledger.getCommissionAmount());
            if ("sale".equals(ledger.getBizType()) || "void_sale".equals(ledger.getBizType())) {
                saleAmount = saleAmount.add(amount);
            } else if ("return".equals(ledger.getBizType()) || "void_return".equals(ledger.getBizType())) {
                returnAmount = returnAmount.add(amount);
            }
        }
        BigDecimal totalAmount = saleAmount.add(returnAmount);
        String settlementId = IdUtils.randomId();
        Date now = new Date();
        CommissionSettlement settlement = new CommissionSettlement();
        settlement.setId(settlementId);
        settlement.setSalespersonId(req.getSalespersonId());
        settlement.setSettledBy((String) session.getAttribute("warehouseAccountId"));
        settlement.setSaleAmount(saleAmount);
        settlement.setReturnAmount(returnAmount);
        settlement.setTotalAmount(totalAmount);
        settlement.setLedgerCount(ledgers.size());
        settlement.setRemark(req.getRemark());
        settlement.setCreatedAt(now);
        commissionSettlementMapper.insert(settlement);
        for (CommissionLedger ledger : ledgers) {
            ledger.setSettlementId(settlementId);
            ledger.setSettledAt(now);
            commissionLedgerMapper.updateById(ledger);
        }
        CommissionSettlementVO vo = new CommissionSettlementVO();
        vo.setId(settlement.getId());
        vo.setSalespersonId(settlement.getSalespersonId());
        vo.setSalespersonName(salesperson.getDisplayName());
        vo.setSettledBy(settlement.getSettledBy());
        vo.setSettledByName((String) session.getAttribute("warehouseAccountName"));
        vo.setSaleAmount(saleAmount);
        vo.setReturnAmount(returnAmount);
        vo.setTotalAmount(totalAmount);
        vo.setLedgerCount(ledgers.size());
        vo.setRemark(settlement.getRemark());
        vo.setCreatedAt(settlement.getCreatedAt());
        return Result.ok(vo);
    }

    private List<Account> listSalespersons() {
        return accountMapper.selectList(
            new LambdaQueryWrapper<Account>()
                .eq(Account::getRole, "salesperson")
                .orderByAsc(Account::getCreatedAt)
        );
    }

    private List<CommissionLedger> listUnsettledLedgers(String salespersonId) {
        return commissionLedgerMapper.selectList(
            new LambdaQueryWrapper<CommissionLedger>()
                .eq(CommissionLedger::getSalespersonId, salespersonId)
                .isNull(CommissionLedger::getSettlementId)
                .orderByAsc(CommissionLedger::getCreatedAt)
        );
    }

    private CommissionSummaryVO buildSummary(Account salesperson, List<CommissionLedger> unsettledLedgers) {
        CommissionSummaryVO vo = new CommissionSummaryVO();
        vo.setSalespersonId(salesperson.getId());
        vo.setSalespersonName(salesperson.getDisplayName());
        BigDecimal saleAmount = BigDecimal.ZERO;
        BigDecimal returnAmount = BigDecimal.ZERO;
        for (CommissionLedger ledger : unsettledLedgers) {
            BigDecimal amount = defaultAmount(ledger.getCommissionAmount());
            if ("sale".equals(ledger.getBizType()) || "void_sale".equals(ledger.getBizType())) {
                saleAmount = saleAmount.add(amount);
            } else if ("return".equals(ledger.getBizType()) || "void_return".equals(ledger.getBizType())) {
                returnAmount = returnAmount.add(amount);
            }
        }
        vo.setSaleAmount(saleAmount);
        vo.setReturnAmount(returnAmount);
        vo.setTotalAmount(saleAmount.add(returnAmount));
        vo.setLedgerCount(unsettledLedgers.size());
        return vo;
    }

    private BigDecimal defaultAmount(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private <T> Result<T> rejectIfNotAdmin(HttpSession session) {
        Object role = session.getAttribute("warehouseAccountRole");
        if ("admin".equals(role)) {
            return null;
        }
        if (session.getAttribute("warehouseAccountId") == null) {
            return Result.error("未登录");
        }
        return Result.error("仅管理员可操作");
    }

    @Data
    public static class CommissionSummaryVO {
        private String salespersonId;
        private String salespersonName;
        private BigDecimal saleAmount;
        private BigDecimal returnAmount;
        private BigDecimal totalAmount;
        private Integer ledgerCount;
        private String lastSettlementId;
        private Date lastSettlementAt;
        private BigDecimal lastSettlementAmount;
    }

    @Data
    public static class CommissionSettlementVO {
        private String id;
        private String salespersonId;
        private String salespersonName;
        private String settledBy;
        private String settledByName;
        private BigDecimal saleAmount;
        private BigDecimal returnAmount;
        private BigDecimal totalAmount;
        private Integer ledgerCount;
        private String remark;
        private Date createdAt;
    }

    @Data
    public static class CommissionSettlementDetailVO {
        private CommissionSettlementVO settlement;
        private List<CommissionLedger> ledgers;
    }

    @Data
    public static class CommissionSettleRequest {
        private String salespersonId;
        private String remark;
    }
}
