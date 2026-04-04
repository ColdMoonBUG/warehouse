package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.yeqifu.warehouse.common.IdUtils;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.Account;
import com.yeqifu.warehouse.entity.CommissionLedger;
import com.yeqifu.warehouse.entity.CommissionSettlement;
import com.yeqifu.warehouse.entity.ReturnDoc;
import com.yeqifu.warehouse.entity.SaleDoc;
import com.yeqifu.warehouse.entity.Store;
import com.yeqifu.warehouse.mapper.AccountMapper;
import com.yeqifu.warehouse.mapper.CommissionLedgerMapper;
import com.yeqifu.warehouse.mapper.CommissionSettlementMapper;
import com.yeqifu.warehouse.mapper.ReturnDocMapper;
import com.yeqifu.warehouse.mapper.SaleDocMapper;
import com.yeqifu.warehouse.mapper.StoreMapper;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpSession;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/finance/commission")
@CrossOrigin
public class FinanceController {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");

    @Autowired
    private AccountMapper accountMapper;

    @Autowired
    private CommissionLedgerMapper commissionLedgerMapper;

    @Autowired
    private CommissionSettlementMapper commissionSettlementMapper;

    @Autowired
    private SaleDocMapper saleDocMapper;

    @Autowired
    private ReturnDocMapper returnDocMapper;

    @Autowired
    private StoreMapper storeMapper;

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

    @GetMapping("/today")
    public Result<CommissionTodayVO> today(HttpSession session) {
        Account salesperson = getCurrentAccount(session);
        Result<CommissionTodayVO> auth = rejectIfNotSalesperson(session, salesperson);
        if (auth != null) {
            return auth;
        }

        List<CommissionLedger> ledgers = listTodayLedgers(salesperson.getId());
        BigDecimal saleAmount = BigDecimal.ZERO;
        BigDecimal returnAmount = BigDecimal.ZERO;
        for (CommissionLedger ledger : ledgers) {
            BigDecimal amount = defaultAmount(ledger.getCommissionAmount());
            if (isSaleCommissionBizType(ledger.getBizType())) {
                saleAmount = saleAmount.add(amount);
            } else {
                returnAmount = returnAmount.add(amount);
            }
        }

        CommissionTodayVO result = new CommissionTodayVO();
        result.setDate(LocalDate.now(BUSINESS_ZONE).toString());
        result.setSalespersonId(salesperson.getId());
        result.setSalespersonName(salesperson.getDisplayName());
        result.setSaleAmount(saleAmount);
        result.setReturnAmount(returnAmount);
        result.setTotalAmount(saleAmount.add(returnAmount));
        result.setLedgerCount(ledgers.size());
        result.setLedgers(buildCommissionLedgerItems(ledgers));
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
            if (isSaleCommissionBizType(ledger.getBizType())) {
                saleAmount = saleAmount.add(amount);
            } else {
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

    private List<CommissionLedger> listTodayLedgers(String salespersonId) {
        LocalDate today = LocalDate.now(BUSINESS_ZONE);
        Date startAt = Date.from(today.atStartOfDay(BUSINESS_ZONE).toInstant());
        Date endAt = Date.from(today.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant());
        return commissionLedgerMapper.selectList(
            new LambdaQueryWrapper<CommissionLedger>()
                .eq(CommissionLedger::getSalespersonId, salespersonId)
                .ge(CommissionLedger::getCreatedAt, startAt)
                .lt(CommissionLedger::getCreatedAt, endAt)
                .orderByDesc(CommissionLedger::getCreatedAt)
        );
    }

    private List<CommissionLedgerItemVO> buildCommissionLedgerItems(List<CommissionLedger> ledgers) {
        if (ledgers.isEmpty()) {
            return new ArrayList<>();
        }

        Set<String> saleDocIds = new LinkedHashSet<>();
        Set<String> returnDocIds = new LinkedHashSet<>();
        Set<String> storeIds = new LinkedHashSet<>();
        for (CommissionLedger ledger : ledgers) {
            if (ledger.getDocId() != null && !ledger.getDocId().isEmpty()) {
                if (isSaleCommissionBizType(ledger.getBizType())) {
                    saleDocIds.add(ledger.getDocId());
                } else {
                    returnDocIds.add(ledger.getDocId());
                }
            }
            if (ledger.getStoreId() != null && !ledger.getStoreId().isEmpty()) {
                storeIds.add(ledger.getStoreId());
            }
        }

        Map<String, SaleDoc> saleDocMap = saleDocIds.isEmpty()
            ? new LinkedHashMap<>()
            : saleDocMapper.selectBatchIds(saleDocIds).stream()
                .collect(Collectors.toMap(SaleDoc::getId, item -> item, (left, right) -> left, LinkedHashMap::new));
        Map<String, ReturnDoc> returnDocMap = returnDocIds.isEmpty()
            ? new LinkedHashMap<>()
            : returnDocMapper.selectBatchIds(returnDocIds).stream()
                .collect(Collectors.toMap(ReturnDoc::getId, item -> item, (left, right) -> left, LinkedHashMap::new));

        for (SaleDoc doc : saleDocMap.values()) {
            if (doc.getStoreId() != null && !doc.getStoreId().isEmpty()) {
                storeIds.add(doc.getStoreId());
            }
        }
        for (ReturnDoc doc : returnDocMap.values()) {
            if (doc.getStoreId() != null && !doc.getStoreId().isEmpty()) {
                storeIds.add(doc.getStoreId());
            }
        }

        Map<String, Store> storeMap = storeIds.isEmpty()
            ? new LinkedHashMap<>()
            : storeMapper.selectBatchIds(storeIds).stream()
                .collect(Collectors.toMap(Store::getId, item -> item, (left, right) -> left, LinkedHashMap::new));

        List<CommissionLedgerItemVO> items = new ArrayList<>();
        for (CommissionLedger ledger : ledgers) {
            CommissionLedgerItemVO item = new CommissionLedgerItemVO();
            item.setId(ledger.getId());
            item.setBizType(ledger.getBizType());
            item.setDocId(ledger.getDocId());
            item.setSalespersonId(ledger.getSalespersonId());
            item.setStoreId(ledger.getStoreId());
            item.setProductId(ledger.getProductId());
            item.setQty(ledger.getQty());
            item.setPrice(defaultAmount(ledger.getPrice()));
            item.setAmount(defaultAmount(ledger.getAmount()));
            item.setCommissionRate(defaultAmount(ledger.getCommissionRate()));
            item.setCommissionAmount(defaultAmount(ledger.getCommissionAmount()));
            item.setSettlementId(ledger.getSettlementId());
            item.setSettledAt(ledger.getSettledAt());
            item.setCreatedAt(ledger.getCreatedAt());

            String resolvedStoreId = ledger.getStoreId();
            if (isSaleCommissionBizType(ledger.getBizType())) {
                item.setDocType("sale");
                SaleDoc doc = saleDocMap.get(ledger.getDocId());
                if (doc != null) {
                    item.setDocCode(doc.getCode());
                    item.setDocDate(doc.getDocDate());
                    item.setDocStatus(doc.getStatus());
                    if ((resolvedStoreId == null || resolvedStoreId.isEmpty()) && doc.getStoreId() != null && !doc.getStoreId().isEmpty()) {
                        resolvedStoreId = doc.getStoreId();
                    }
                }
            } else {
                item.setDocType("return");
                ReturnDoc doc = returnDocMap.get(ledger.getDocId());
                if (doc != null) {
                    item.setDocCode(doc.getCode());
                    item.setDocDate(doc.getDocDate());
                    item.setDocStatus(doc.getStatus());
                    if ((resolvedStoreId == null || resolvedStoreId.isEmpty()) && doc.getStoreId() != null && !doc.getStoreId().isEmpty()) {
                        resolvedStoreId = doc.getStoreId();
                    }
                }
            }

            item.setStoreId(resolvedStoreId);
            if (resolvedStoreId != null && !resolvedStoreId.isEmpty()) {
                Store store = storeMap.get(resolvedStoreId);
                if (store != null) {
                    item.setStoreName(store.getName());
                    item.setStoreAddress(store.getAddress());
                }
            }
            items.add(item);
        }
        return items;
    }

    private CommissionSummaryVO buildSummary(Account salesperson, List<CommissionLedger> unsettledLedgers) {
        CommissionSummaryVO vo = new CommissionSummaryVO();
        vo.setSalespersonId(salesperson.getId());
        vo.setSalespersonName(salesperson.getDisplayName());
        BigDecimal saleAmount = BigDecimal.ZERO;
        BigDecimal returnAmount = BigDecimal.ZERO;
        for (CommissionLedger ledger : unsettledLedgers) {
            BigDecimal amount = defaultAmount(ledger.getCommissionAmount());
            if (isSaleCommissionBizType(ledger.getBizType())) {
                saleAmount = saleAmount.add(amount);
            } else {
                returnAmount = returnAmount.add(amount);
            }
        }
        vo.setSaleAmount(saleAmount);
        vo.setReturnAmount(returnAmount);
        vo.setTotalAmount(saleAmount.add(returnAmount));
        vo.setLedgerCount(unsettledLedgers.size());
        return vo;
    }

    private boolean isSaleCommissionBizType(String bizType) {
        return "sale".equals(bizType) || "void_sale".equals(bizType);
    }

    private BigDecimal defaultAmount(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private Account getCurrentAccount(HttpSession session) {
        Object accountId = session.getAttribute("warehouseAccountId");
        if (!(accountId instanceof String)) {
            return null;
        }
        return accountMapper.selectById((String) accountId);
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

    private <T> Result<T> rejectIfNotSalesperson(HttpSession session, Account account) {
        if (session.getAttribute("warehouseAccountId") == null) {
            return Result.error("未登录");
        }
        if (account == null || !"active".equals(account.getStatus())) {
            return Result.error("账户不存在或已停用");
        }
        if (!"salesperson".equals(account.getRole())) {
            return Result.error("仅业务员可查看");
        }
        return null;
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
    public static class CommissionTodayVO {
        private String date;
        private String salespersonId;
        private String salespersonName;
        private BigDecimal saleAmount;
        private BigDecimal returnAmount;
        private BigDecimal totalAmount;
        private Integer ledgerCount;
        private List<CommissionLedgerItemVO> ledgers;
    }

    @Data
    public static class CommissionLedgerItemVO {
        private String id;
        private String bizType;
        private String docType;
        private String docId;
        private String docCode;
        private Date docDate;
        private String docStatus;
        private String salespersonId;
        private String storeId;
        private String storeName;
        private String storeAddress;
        private String productId;
        private Integer qty;
        private BigDecimal price;
        private BigDecimal amount;
        private BigDecimal commissionRate;
        private BigDecimal commissionAmount;
        private String settlementId;
        private Date settledAt;
        private Date createdAt;
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
