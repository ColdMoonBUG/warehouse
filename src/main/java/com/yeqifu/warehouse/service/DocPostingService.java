package com.yeqifu.warehouse.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.yeqifu.warehouse.common.BizException;
import com.yeqifu.warehouse.common.IdUtils;
import com.yeqifu.warehouse.common.QueryUtils;
import com.yeqifu.warehouse.common.RuntimeModeManager;
import com.yeqifu.warehouse.entity.Account;
import com.yeqifu.warehouse.entity.CommissionLedger;
import com.yeqifu.warehouse.entity.Product;
import com.yeqifu.warehouse.entity.ReturnDoc;
import com.yeqifu.warehouse.entity.ReturnLine;
import com.yeqifu.warehouse.entity.SaleDoc;
import com.yeqifu.warehouse.entity.SaleLine;
import com.yeqifu.warehouse.entity.Stock;
import com.yeqifu.warehouse.mapper.AccountMapper;
import com.yeqifu.warehouse.mapper.CommissionLedgerMapper;
import com.yeqifu.warehouse.mapper.ProductMapper;
import com.yeqifu.warehouse.mapper.ReturnDocMapper;
import com.yeqifu.warehouse.mapper.ReturnLineMapper;
import com.yeqifu.warehouse.mapper.SaleDocMapper;
import com.yeqifu.warehouse.mapper.SaleLineMapper;
import com.yeqifu.warehouse.mapper.StockMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.SimpleDateFormat;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 销单 / 退单的保存、过账、作废。
 * 过账与作废先用条件更新“抢占”单据状态，同一张单并发或重复提交时只有一次会生效。
 */
@Service
public class DocPostingService {

    private static final Logger log = LoggerFactory.getLogger(DocPostingService.class);

    public static final String MAIN_WAREHOUSE_ID = "main";
    public static final String RETURN_WAREHOUSE_ID = "return";
    public static final BigDecimal COMMISSION_RATE = new BigDecimal("0.06");

    @Autowired
    private SaleDocMapper saleDocMapper;
    @Autowired
    private SaleLineMapper saleLineMapper;
    @Autowired
    private ReturnDocMapper returnDocMapper;
    @Autowired
    private ReturnLineMapper returnLineMapper;
    @Autowired
    private StockMapper stockMapper;
    @Autowired
    private ProductMapper productMapper;
    @Autowired
    private AccountMapper accountMapper;
    @Autowired
    private CommissionLedgerMapper commissionLedgerMapper;
    @Autowired
    private StockLedgerService stockLedgerService;
    @Autowired
    private RuntimeModeManager runtimeModeManager;

    // ======================================================================
    // 销单
    // ======================================================================

    /**
     * 保存销单草稿。传入的 id 不存在时按该 id 新建（支持客户端预生成 id 做幂等提交）。
     * 已过账/已作废的单据不允许再被保存覆盖。
     */
    @Transactional
    public SaleDoc saveSaleDraft(SaleDoc doc, List<SaleLine> lines) {
        if (doc == null) {
            throw new BizException("单据数据为空");
        }
        if (lines == null) {
            lines = Collections.emptyList();
        }
        normalizeSaleLines(lines);
        if (!QueryUtils.hasText(doc.getPaymentType())) {
            doc.setPaymentType("bill");
        }
        if (doc.getDocDate() == null) {
            doc.setDocDate(new Date());
        }

        int totalQty = 0;
        BigDecimal totalAmount = BigDecimal.ZERO;
        for (SaleLine line : lines) {
            int qty = line.getQty() == null ? 0 : line.getQty();
            totalQty += qty;
            if (line.getAmount() == null) {
                BigDecimal price = line.getPrice() == null ? BigDecimal.ZERO : line.getPrice();
                line.setAmount(price.multiply(new BigDecimal(qty)));
            }
            totalAmount = totalAmount.add(line.getAmount());
        }
        doc.setTotalQty(totalQty);
        doc.setTotalAmount(totalAmount);
        doc.setStatus("draft");
        doc.setUpdatedAt(null);

        SaleDoc existing = QueryUtils.hasText(doc.getId()) ? saleDocMapper.selectById(doc.getId()) : null;
        if (existing == null) {
            if (!QueryUtils.hasText(doc.getId())) {
                doc.setId(IdUtils.randomId());
            } else if (!QueryUtils.isValidClientId(doc.getId())) {
                throw new BizException("单据编号格式不正确");
            }
            doc.setCreatedAt(null);
            insertSaleWithCode(doc);
        } else {
            ensureDraft(existing.getStatus(), existing.getCode());
            if (!QueryUtils.hasText(doc.getCode())) {
                doc.setCode(QueryUtils.hasText(existing.getCode()) ? existing.getCode() : generateSaleCode(doc));
            }
            doc.setCreatedAt(null);
            saleDocMapper.updateById(doc);
            // 仅当前端传入了明细时才更新明细，避免仅更新单头字段时意外清空明细
            if (!lines.isEmpty()) {
                saleLineMapper.delete(new LambdaQueryWrapper<SaleLine>().eq(SaleLine::getDocId, doc.getId()));
            }
        }

        int lineIdx = 0;
        for (SaleLine line : lines) {
            line.setId(IdUtils.randomId());
            line.setDocId(doc.getId());
            // 行号：前端传了则保留，否则用录入顺序兜底（打印/重建排序依赖）
            if (line.getLineNo() == null || line.getLineNo() <= 0) {
                line.setLineNo(lineIdx + 1);
            }
            lineIdx++;
            saleLineMapper.insert(line);
        }
        return doc;
    }

    @Transactional
    public void postSale(String id) {
        SaleDoc doc = saleDocMapper.selectById(id);
        if (doc == null || !"draft".equals(doc.getStatus())) {
            throw new BizException("单据状态异常");
        }
        claimSaleStatus(id, "draft", "posted");

        List<SaleLine> lines = saleLineMapper.selectList(new LambdaQueryWrapper<SaleLine>().eq(SaleLine::getDocId, id));
        String fromWarehouseId = QueryUtils.hasText(doc.getWarehouseId()) ? doc.getWarehouseId() : MAIN_WAREHOUSE_ID;
        String stockError = validateSaleStock(fromWarehouseId, lines);
        if (stockError != null) {
            throw new BizException(stockError);
        }
        boolean isGift = "gift".equals(doc.getDocType());
        for (SaleLine line : lines) {
            int qty = line.getQty() == null ? 0 : line.getQty();
            BigDecimal price = line.getPrice() == null ? BigDecimal.ZERO : line.getPrice();
            BigDecimal amount = price.multiply(new BigDecimal(qty));

            stockLedgerService.applyStockDelta(fromWarehouseId, line.getProductId(), -qty);
            stockLedgerService.insertLedger("sale", id, fromWarehouseId, line.getProductId(), -qty);

            if (!isGift) {
                BigDecimal commissionAmount = amount.multiply(COMMISSION_RATE).setScale(2, RoundingMode.HALF_UP);
                insertCommission("sale", id, doc.getSalespersonId(), doc.getStoreId(), line.getProductId(),
                    qty, price, amount, COMMISSION_RATE, commissionAmount);
            } else {
                // 赠送单按进价从工资中扣除（相当于业务员自购赠出）
                BigDecimal purchasePrice = purchasePrice(line.getProductId());
                insertCommission("gift", id, doc.getSalespersonId(), doc.getStoreId(), line.getProductId(),
                    qty, purchasePrice, purchasePrice.multiply(new BigDecimal(qty)), BigDecimal.ZERO,
                    purchasePrice.multiply(new BigDecimal(qty)).negate());
            }
        }
        if ("cash".equals(doc.getPaymentType())) {
            saleDocMapper.update(null, new LambdaUpdateWrapper<SaleDoc>()
                .set(SaleDoc::getSettled, 1)
                .set(SaleDoc::getSettledAt, new Date())
                .set(SaleDoc::getSettledBy, String.valueOf(doc.getSalespersonId()))
                .eq(SaleDoc::getId, id));
        }
    }

    /**
     * 作废销单。cascadeReturn=true 时连同关联的已过账退单一起作废；
     * 退单作废失败（如车库库存已不足）不阻断销单作废，返回提示文字，否则返回 null。
     */
    @Transactional
    public String voidSale(String id, boolean cascadeReturn) {
        SaleDoc doc = saleDocMapper.selectById(id);
        if (doc == null || !"posted".equals(doc.getStatus())) {
            throw new BizException("只能作废已过账单据");
        }
        claimSaleStatus(id, "posted", "voided");

        List<SaleLine> lines = saleLineMapper.selectList(new LambdaQueryWrapper<SaleLine>().eq(SaleLine::getDocId, id));
        String fromWarehouseId = QueryUtils.hasText(doc.getWarehouseId()) ? doc.getWarehouseId() : MAIN_WAREHOUSE_ID;
        boolean isGift = "gift".equals(doc.getDocType());
        for (SaleLine line : lines) {
            int qty = line.getQty() == null ? 0 : line.getQty();
            BigDecimal price = line.getPrice() == null ? BigDecimal.ZERO : line.getPrice();
            BigDecimal amount = price.multiply(new BigDecimal(qty));

            stockLedgerService.applyStockDelta(fromWarehouseId, line.getProductId(), qty);
            stockLedgerService.insertLedger("sale", id, fromWarehouseId, line.getProductId(), qty);

            if (!isGift) {
                BigDecimal commissionAmount = amount.multiply(COMMISSION_RATE).setScale(2, RoundingMode.HALF_UP).negate();
                insertCommission("void_sale", id, doc.getSalespersonId(), doc.getStoreId(), line.getProductId(),
                    qty, price, amount, COMMISSION_RATE, commissionAmount);
            } else {
                // 赠送单作废：返还按进价扣除的金额（正值）
                BigDecimal purchasePrice = purchasePrice(line.getProductId());
                insertCommission("void_gift", id, doc.getSalespersonId(), doc.getStoreId(), line.getProductId(),
                    qty, purchasePrice, purchasePrice.multiply(new BigDecimal(qty)), BigDecimal.ZERO,
                    purchasePrice.multiply(new BigDecimal(qty)));
            }
        }

        if (!cascadeReturn || !QueryUtils.hasText(doc.getReturnDocId())) {
            return null;
        }
        ReturnDoc linked = returnDocMapper.selectById(doc.getReturnDocId());
        if (linked == null || !"posted".equals(linked.getStatus())) {
            return null;
        }
        TransactionStatus tx = TransactionAspectSupport.currentTransactionStatus();
        Object savepoint = tx.createSavepoint();
        try {
            doVoidReturn(linked);
            tx.releaseSavepoint(savepoint);
            return null;
        } catch (BizException e) {
            tx.rollbackToSavepoint(savepoint);
            log.warn("[sale/void] 销单 {} 已作废，但关联退单 {} 作废失败: {}", doc.getCode(), linked.getCode(), e.getMessage());
            return "关联退单" + linked.getCode() + "未能作废：" + e.getMessage();
        }
    }

    // ======================================================================
    // 退单
    // ======================================================================

    @Transactional
    public ReturnDoc saveReturnDraft(ReturnDoc doc, List<ReturnLine> lines) {
        if (doc == null) {
            throw new BizException("单据数据为空");
        }
        if (lines == null) {
            lines = Collections.emptyList();
        }
        normalizeReturnLines(lines);
        if (doc.getDocDate() == null) {
            doc.setDocDate(new Date());
        }
        if (!QueryUtils.hasText(doc.getReturnType())) {
            doc.setReturnType("vehicle_return");
        }
        if (!QueryUtils.hasText(doc.getFromWarehouseId())) {
            doc.setFromWarehouseId(MAIN_WAREHOUSE_ID);
        }

        int totalQty = 0;
        BigDecimal totalAmount = BigDecimal.ZERO;
        for (ReturnLine line : lines) {
            int qty = line.getQty() == null ? 0 : line.getQty();
            totalQty += qty;
            if (line.getAmount() == null) {
                BigDecimal price = line.getPrice() == null ? BigDecimal.ZERO : line.getPrice();
                line.setAmount(price.multiply(new BigDecimal(qty)));
            }
            totalAmount = totalAmount.add(line.getAmount());
        }
        doc.setTotalQty(totalQty);
        doc.setTotalAmount(totalAmount);
        doc.setStatus("draft");
        doc.setUpdatedAt(null);

        ReturnDoc existing = QueryUtils.hasText(doc.getId()) ? returnDocMapper.selectById(doc.getId()) : null;
        if (existing == null) {
            if (!QueryUtils.hasText(doc.getId())) {
                doc.setId(IdUtils.randomId());
            } else if (!QueryUtils.isValidClientId(doc.getId())) {
                throw new BizException("单据编号格式不正确");
            }
            doc.setCreatedAt(null);
            insertReturnWithCode(doc);
        } else {
            ensureDraft(existing.getStatus(), existing.getCode());
            doc.setCreatedAt(null);
            returnDocMapper.updateById(doc);
            // 仅当前端传入了明细时才更新明细，避免只更新单头时意外清空明细
            if (!lines.isEmpty()) {
                returnLineMapper.delete(new LambdaQueryWrapper<ReturnLine>().eq(ReturnLine::getDocId, doc.getId()));
            }
        }

        int lineIdx = 0;
        for (ReturnLine line : lines) {
            line.setId(IdUtils.randomId());
            line.setDocId(doc.getId());
            if (line.getLineNo() == null || line.getLineNo() <= 0) {
                line.setLineNo(lineIdx + 1);
            }
            lineIdx++;
            returnLineMapper.insert(line);
        }
        return doc;
    }

    @Transactional
    public void postReturn(String id) {
        ReturnDoc doc = returnDocMapper.selectById(id);
        if (doc == null || !"draft".equals(doc.getStatus())) {
            throw new BizException("单据状态异常");
        }
        claimReturnStatus(id, "draft", "posted");

        List<ReturnLine> lines = returnLines(id);
        String fromWarehouseId = QueryUtils.hasText(doc.getFromWarehouseId()) ? doc.getFromWarehouseId() : MAIN_WAREHOUSE_ID;
        String toWarehouseId = QueryUtils.hasText(doc.getToWarehouseId()) ? doc.getToWarehouseId() : RETURN_WAREHOUSE_ID;
        boolean toWarehouse = "warehouse_return".equals(doc.getReturnType());
        for (ReturnLine line : lines) {
            BigDecimal price = line.getPrice() == null ? BigDecimal.ZERO : line.getPrice();
            int qty = line.getQty() == null ? 0 : line.getQty();
            BigDecimal amount = price.multiply(new BigDecimal(qty));
            if (toWarehouse) {
                // 车库退回主仓/退货仓
                stockLedgerService.applyStockDelta(fromWarehouseId, line.getProductId(), -qty);
                stockLedgerService.applyStockDelta(toWarehouseId, line.getProductId(), qty);
                stockLedgerService.insertLedger("return_warehouse", id, fromWarehouseId, line.getProductId(), -qty);
                stockLedgerService.insertLedger("return_warehouse", id, toWarehouseId, line.getProductId(), qty);
            } else {
                // 默认车库退货
                stockLedgerService.applyStockDelta(fromWarehouseId, line.getProductId(), qty);
                stockLedgerService.insertLedger("return_vehicle", id, fromWarehouseId, line.getProductId(), qty);
                // 超市退货扣提成；退货回仓是仓管操作，不扣
                BigDecimal commissionAmount = amount.multiply(COMMISSION_RATE).setScale(2, RoundingMode.HALF_UP).negate();
                insertCommission("return", id, doc.getSalespersonId(), doc.getStoreId(), line.getProductId(),
                    qty, price, amount, COMMISSION_RATE, commissionAmount);
            }
        }
    }

    @Transactional
    public void voidReturn(String id) {
        ReturnDoc doc = returnDocMapper.selectById(id);
        if (doc == null || !"posted".equals(doc.getStatus())) {
            throw new BizException("只能作废已过账单据");
        }
        doVoidReturn(doc);
    }

    private void doVoidReturn(ReturnDoc doc) {
        String id = doc.getId();
        claimReturnStatus(id, "posted", "voided");
        List<ReturnLine> lines = returnLines(id);
        String fromWarehouseId = QueryUtils.hasText(doc.getFromWarehouseId()) ? doc.getFromWarehouseId() : MAIN_WAREHOUSE_ID;
        String toWarehouseId = QueryUtils.hasText(doc.getToWarehouseId()) ? doc.getToWarehouseId() : RETURN_WAREHOUSE_ID;
        boolean toWarehouse = "warehouse_return".equals(doc.getReturnType());
        for (ReturnLine line : lines) {
            int qty = line.getQty() == null ? 0 : line.getQty();
            BigDecimal price = line.getPrice() == null ? BigDecimal.ZERO : line.getPrice();
            BigDecimal amount = price.multiply(new BigDecimal(qty));
            if (toWarehouse) {
                stockLedgerService.applyStockDelta(fromWarehouseId, line.getProductId(), qty);
                stockLedgerService.applyStockDelta(toWarehouseId, line.getProductId(), -qty);
                stockLedgerService.insertLedger("return_warehouse", id, fromWarehouseId, line.getProductId(), qty);
                stockLedgerService.insertLedger("return_warehouse", id, toWarehouseId, line.getProductId(), -qty);
            } else {
                stockLedgerService.applyStockDelta(fromWarehouseId, line.getProductId(), -qty);
                stockLedgerService.insertLedger("return_vehicle", id, fromWarehouseId, line.getProductId(), -qty);
                // 超市退货才有提成流水需要对冲；退货回仓无提成流水
                BigDecimal commissionAmount = amount.multiply(COMMISSION_RATE).setScale(2, RoundingMode.HALF_UP);
                insertCommission("void_return", id, doc.getSalespersonId(), doc.getStoreId(), line.getProductId(),
                    qty, price, amount, COMMISSION_RATE, commissionAmount);
            }
        }
    }

    // ======================================================================
    // 一次提交（销单 + 可选退单 + 关联），同一事务，可安全重试
    // ======================================================================

    /**
     * 销单与随单退货在一个事务里完成保存、过账、关联。
     * 客户端预先生成两张单的 id，网络超时后用同样的 id 重试：已过账的单不会重复过账，直接返回结果。
     */
    @Transactional
    public Map<String, Object> submitSale(SaleDoc sale, List<SaleLine> saleLines, ReturnDoc ret, List<ReturnLine> returnLines) {
        if (sale == null || !QueryUtils.isValidClientId(sale.getId())) {
            throw new BizException("缺少销单编号");
        }
        boolean hasReturn = ret != null && returnLines != null && !returnLines.isEmpty();
        if (hasReturn && (!QueryUtils.isValidClientId(ret.getId()) || ret.getId().equals(sale.getId()))) {
            throw new BizException("缺少退单编号");
        }

        boolean saleReplayed = submitSalePart(sale, saleLines);
        boolean returnReplayed = false;
        if (hasReturn) {
            returnReplayed = submitReturnPart(ret, returnLines);
            linkReturnToSale(sale.getId(), ret.getId());
        }

        Map<String, Object> result = new HashMap<>();
        result.put("sale", loadSale(sale.getId()));
        result.put("returnDoc", hasReturn ? loadReturn(ret.getId()) : null);
        result.put("replayed", saleReplayed && (!hasReturn || returnReplayed));
        return result;
    }

    /** 单独提交退单（可选关联到一张已过账销单），可安全重试。 */
    @Transactional
    public Map<String, Object> submitReturn(ReturnDoc ret, List<ReturnLine> lines, String linkSaleId) {
        if (ret == null || !QueryUtils.isValidClientId(ret.getId())) {
            throw new BizException("缺少退单编号");
        }
        if (lines == null || lines.isEmpty()) {
            throw new BizException("请添加退货明细");
        }
        boolean replayed = submitReturnPart(ret, lines);
        if (QueryUtils.hasText(linkSaleId)) {
            SaleDoc sale = saleDocMapper.selectById(linkSaleId);
            // 销单已作废时不再关联（例如退单重建时原销单也已作废）
            if (sale != null && !"voided".equals(sale.getStatus())) {
                linkReturnToSale(linkSaleId, ret.getId());
            }
        }
        Map<String, Object> result = new HashMap<>();
        result.put("returnDoc", loadReturn(ret.getId()));
        result.put("replayed", replayed);
        return result;
    }

    /** @return true 表示该单之前已过账，本次只是重放 */
    private boolean submitSalePart(SaleDoc sale, List<SaleLine> lines) {
        SaleDoc existing = saleDocMapper.selectById(sale.getId());
        if (existing != null && "posted".equals(existing.getStatus())) {
            return true;
        }
        if (existing != null && !"draft".equals(existing.getStatus())) {
            throw new BizException("销单" + existing.getCode() + "已作废，请重新开单");
        }
        if (lines == null || lines.isEmpty()) {
            throw new BizException("请添加销售明细");
        }
        saveSaleDraft(sale, lines);
        postSale(sale.getId());
        return false;
    }

    private boolean submitReturnPart(ReturnDoc ret, List<ReturnLine> lines) {
        ReturnDoc existing = returnDocMapper.selectById(ret.getId());
        if (existing != null && "posted".equals(existing.getStatus())) {
            return true;
        }
        if (existing != null && !"draft".equals(existing.getStatus())) {
            throw new BizException("退单" + existing.getCode() + "已作废，请重新开单");
        }
        saveReturnDraft(ret, lines);
        postReturn(ret.getId());
        return false;
    }

    /** 把退单关联到销单；销单已关联其他仍有效的退单时拒绝，避免覆盖原关联。 */
    @Transactional
    public void linkReturnToSale(String saleId, String returnDocId) {
        SaleDoc sale = saleDocMapper.selectById(saleId);
        if (sale == null) {
            throw new BizException("销单不存在");
        }
        ReturnDoc ret = returnDocMapper.selectById(returnDocId);
        if (ret == null) {
            throw new BizException("退单不存在");
        }
        if (returnDocId.equals(sale.getReturnDocId())) {
            return;
        }
        if (QueryUtils.hasText(sale.getReturnDocId())) {
            ReturnDoc current = returnDocMapper.selectById(sale.getReturnDocId());
            if (current != null && !"voided".equals(current.getStatus())) {
                throw new BizException("销单" + sale.getCode() + "已关联退单" + current.getCode());
            }
        }
        saleDocMapper.update(null, new LambdaUpdateWrapper<SaleDoc>()
            .set(SaleDoc::getReturnDocId, returnDocId)
            .eq(SaleDoc::getId, saleId));
    }

    public SaleDoc loadSale(String id) {
        SaleDoc doc = saleDocMapper.selectById(id);
        if (doc != null) {
            doc.setLines(saleLineMapper.selectList(new LambdaQueryWrapper<SaleLine>()
                .eq(SaleLine::getDocId, id).orderByAsc(SaleLine::getLineNo).orderByAsc(SaleLine::getId)));
        }
        return doc;
    }

    public ReturnDoc loadReturn(String id) {
        ReturnDoc doc = returnDocMapper.selectById(id);
        if (doc != null) {
            doc.setLines(returnLines(id));
        }
        return doc;
    }

    // ======================================================================
    // 内部工具
    // ======================================================================

    private List<ReturnLine> returnLines(String docId) {
        return returnLineMapper.selectList(new LambdaQueryWrapper<ReturnLine>()
            .eq(ReturnLine::getDocId, docId).orderByAsc(ReturnLine::getLineNo).orderByAsc(ReturnLine::getId));
    }

    private void claimSaleStatus(String id, String from, String to) {
        int updated = saleDocMapper.update(null, new LambdaUpdateWrapper<SaleDoc>()
            .set(SaleDoc::getStatus, to)
            .eq(SaleDoc::getId, id)
            .eq(SaleDoc::getStatus, from));
        if (updated == 0) {
            throw new BizException("单据状态已变更，请刷新");
        }
    }

    private void claimReturnStatus(String id, String from, String to) {
        int updated = returnDocMapper.update(null, new LambdaUpdateWrapper<ReturnDoc>()
            .set(ReturnDoc::getStatus, to)
            .eq(ReturnDoc::getId, id)
            .eq(ReturnDoc::getStatus, from));
        if (updated == 0) {
            throw new BizException("单据状态已变更，请刷新");
        }
    }

    private void ensureDraft(String status, String code) {
        if ("posted".equals(status)) {
            throw new BizException("单据" + (code == null ? "" : code) + "已过账，不能再修改");
        }
        if ("voided".equals(status)) {
            throw new BizException("单据" + (code == null ? "" : code) + "已作废，不能再修改");
        }
    }

    private void insertSaleWithCode(SaleDoc doc) {
        for (int attempt = 0; ; attempt++) {
            doc.setCode(generateSaleCode(doc));
            try {
                saleDocMapper.insert(doc);
                return;
            } catch (DuplicateKeyException e) {
                if (isPrimaryKeyConflict(e)) {
                    throw new BizException("单据正在提交中，请稍后刷新查看");
                }
                if (attempt >= 3) {
                    throw e;
                }
            }
        }
    }

    private void insertReturnWithCode(ReturnDoc doc) {
        for (int attempt = 0; ; attempt++) {
            doc.setCode(generateReturnCode(doc));
            try {
                returnDocMapper.insert(doc);
                return;
            } catch (DuplicateKeyException e) {
                if (isPrimaryKeyConflict(e)) {
                    throw new BizException("单据正在提交中，请稍后刷新查看");
                }
                if (attempt >= 3) {
                    throw e;
                }
            }
        }
    }

    private boolean isPrimaryKeyConflict(DuplicateKeyException e) {
        String msg = e.getMostSpecificCause() == null ? e.getMessage() : e.getMostSpecificCause().getMessage();
        return msg != null && msg.contains("PRIMARY");
    }

    public String generateSaleCode(SaleDoc doc) {
        Date docDate = doc.getDocDate() == null ? new Date() : doc.getDocDate();
        String datePart = new SimpleDateFormat("yyyy-MM-dd").format(docDate);
        String vehicleNo = resolveVehicleNo(doc.getSalespersonId());
        String prefix = "XS-" + datePart + "-" + vehicleNo + "-";
        // 查出当天同业务员所有单（排除当前单），取编号最大值，避免 count 因删除/作废导致偏差
        List<SaleDoc> existing = saleDocMapper.selectList(
            new LambdaQueryWrapper<SaleDoc>()
                .select(SaleDoc::getId, SaleDoc::getCode)
                .eq(SaleDoc::getSalespersonId, doc.getSalespersonId())
                .eq(SaleDoc::getDocDate, docDate)
                .likeRight(SaleDoc::getCode, prefix)
                .ne(QueryUtils.hasText(doc.getId()), SaleDoc::getId, doc.getId() != null ? doc.getId() : "")
        );
        return prefix + (maxSeq(existing.stream().map(SaleDoc::getCode).toArray(String[]::new), prefix) + 1);
    }

    public String generateReturnCode(ReturnDoc doc) {
        Date docDate = doc.getDocDate() == null ? new Date() : doc.getDocDate();
        String datePart = new SimpleDateFormat("yyyy-MM-dd").format(docDate);
        String vehicleNo = resolveVehicleNo(doc.getSalespersonId());
        // 车库退货用 th，退货回仓用 tc
        String typeSuffix = "warehouse_return".equals(doc.getReturnType()) ? "tc" : "th";
        String prefix = datePart + "-" + vehicleNo + "-" + typeSuffix + "-";
        List<ReturnDoc> existing = returnDocMapper.selectList(
            new LambdaQueryWrapper<ReturnDoc>()
                .select(ReturnDoc::getId, ReturnDoc::getCode)
                .eq(ReturnDoc::getSalespersonId, doc.getSalespersonId())
                .eq(ReturnDoc::getDocDate, docDate)
                .likeRight(ReturnDoc::getCode, prefix)
                .ne(QueryUtils.hasText(doc.getId()), ReturnDoc::getId, doc.getId() != null ? doc.getId() : "")
        );
        return prefix + (maxSeq(existing.stream().map(ReturnDoc::getCode).toArray(String[]::new), prefix) + 1);
    }

    private long maxSeq(String[] codes, String prefix) {
        long maxSeq = 0;
        for (String code : codes) {
            if (code != null && code.startsWith(prefix)) {
                try {
                    long seq = Long.parseLong(code.substring(prefix.length()));
                    if (seq > maxSeq) {
                        maxSeq = seq;
                    }
                } catch (NumberFormatException ignored) {
                }
            }
        }
        return maxSeq;
    }

    private String resolveVehicleNo(String salespersonId) {
        if (!QueryUtils.hasText(salespersonId)) {
            return "0";
        }
        Account account = accountMapper.selectById(salespersonId);
        if (account == null || account.getDisplayName() == null) {
            return "0";
        }
        switch (account.getDisplayName()) {
            case "大车":
                return "1";
            case "小车":
                return "2";
            case "三车":
                return "3";
            default:
                return "0";
        }
    }

    private void normalizeSaleLines(List<SaleLine> lines) {
        for (SaleLine line : lines) {
            if (line.getBoxQty() == null || line.getBoxQty() < 0) {
                line.setBoxQty(0);
            }
            if (line.getQty() == null || line.getQty() < 0) {
                line.setQty(0);
            }
        }
    }

    private void normalizeReturnLines(List<ReturnLine> lines) {
        for (ReturnLine line : lines) {
            if (line.getBoxQty() == null || line.getBoxQty() < 0) {
                line.setBoxQty(0);
            }
            if (line.getQty() == null || line.getQty() < 0) {
                line.setQty(0);
            }
        }
    }

    private String validateSaleStock(String warehouseId, List<SaleLine> lines) {
        if (runtimeModeManager.useUnlimitedInventory(warehouseId)) {
            return null;
        }
        Map<String, Integer> requiredQtyMap = new HashMap<>();
        for (SaleLine line : lines) {
            if (!QueryUtils.hasText(line.getProductId())) {
                continue;
            }
            int qty = line.getQty() == null ? 0 : line.getQty();
            requiredQtyMap.put(line.getProductId(), requiredQtyMap.getOrDefault(line.getProductId(), 0) + qty);
        }
        for (Map.Entry<String, Integer> entry : requiredQtyMap.entrySet()) {
            String productId = entry.getKey();
            int requiredQty = entry.getValue();
            Stock stock = stockMapper.selectOne(new LambdaQueryWrapper<Stock>()
                .eq(Stock::getWarehouseId, warehouseId)
                .eq(Stock::getProductId, productId));
            int currentQty = stock == null || stock.getQty() == null ? 0 : stock.getQty();
            if (currentQty >= requiredQty) {
                continue;
            }
            Product product = productMapper.selectById(productId);
            String productName = product == null || !QueryUtils.hasText(product.getName()) ? productId : product.getName();
            return productName + "库存不足，车库现有" + currentQty + "袋，销单需要" + requiredQty + "袋";
        }
        return null;
    }

    private BigDecimal purchasePrice(String productId) {
        Product product = productMapper.selectById(productId);
        return product != null && product.getPurchasePrice() != null ? product.getPurchasePrice() : BigDecimal.ZERO;
    }

    private void insertCommission(String bizType, String docId, String salespersonId, String storeId, String productId,
                                  int qty, BigDecimal price, BigDecimal amount, BigDecimal rate, BigDecimal commissionAmount) {
        CommissionLedger ledger = new CommissionLedger();
        ledger.setId(IdUtils.randomId());
        ledger.setBizType(bizType);
        ledger.setDocId(docId);
        ledger.setSalespersonId(salespersonId);
        ledger.setStoreId(storeId);
        ledger.setProductId(productId);
        ledger.setQty(qty);
        ledger.setPrice(price);
        ledger.setAmount(amount);
        ledger.setCommissionRate(rate);
        ledger.setCommissionAmount(commissionAmount);
        commissionLedgerMapper.insert(ledger);
    }
}
