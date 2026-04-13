package com.yeqifu.warehouse.controller;

import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpSession;
import java.util.List;

/**
 * 旧路径兼容层（无 /api 前缀）
 */
@RestController
public class LegacyApiController {

    @Autowired private ProductController productController;
    @Autowired private SupplierController supplierController;
    @Autowired private StoreController storeController;
    @Autowired private WarehouseController warehouseController;
    @Autowired private StockController stockController;
    @Autowired private InboundController inboundController;
    @Autowired private TransferController transferController;
    @Autowired private SaleController saleController;
    @Autowired private ReturnController returnController;
    @Autowired private AccountController accountController;

    // account
    @GetMapping("/account/list")
    public Result<List<Account>> accountList(@RequestParam(required = false) String role,
                                             @RequestParam(required = false, defaultValue = "false") boolean includeInactive) {
        return accountController.list(role, includeInactive);
    }

    @PostMapping("/account/save")
    public Result<Void> accountSave(@RequestBody Account account) { return accountController.save(account); }

    @PostMapping("/account/toggle/{id}")
    public Result<Void> accountToggle(@PathVariable String id) { return accountController.toggle(id); }

    @PostMapping("/account/delete/{id}")
    public Result<Void> accountDelete(@PathVariable String id) { return accountController.delete(id); }

    @PostMapping("/account/setGesture")
    public Result<Void> accountSetGesture(@RequestBody Account req) { return accountController.setGesture(req); }

    @PostMapping("/account/setPassword")
    public Result<Void> accountSetPassword(@RequestBody Account req) { return accountController.setPassword(req); }

    // product
    @GetMapping("/product/list")
    public Result<List<Product>> productList() { return productController.list(); }

    @PostMapping("/product/save")
    public Result<Void> productSave(@RequestBody Product product) { return productController.save(product); }

    @PostMapping("/product/toggle/{id}")
    public Result<Void> productToggle(@PathVariable String id) { return productController.toggle(id); }

    @PostMapping("/product/delete/{id}")
    public Result<Void> productDelete(@PathVariable String id) { return productController.delete(id); }

    // supplier
    @GetMapping("/supplier/list")
    public Result<List<Supplier>> supplierList() { return supplierController.list(); }

    @PostMapping("/supplier/save")
    public Result<Void> supplierSave(@RequestBody Supplier supplier) { return supplierController.save(supplier); }

    @PostMapping("/supplier/toggle/{id}")
    public Result<Void> supplierToggle(@PathVariable String id) { return supplierController.toggle(id); }

    @PostMapping("/supplier/delete/{id}")
    public Result<Void> supplierDelete(@PathVariable String id) { return supplierController.delete(id); }

    // store
    @GetMapping("/store/list")
    public Result<List<Store>> storeList() { return storeController.list(); }

    @PostMapping("/store/save")
    public Result<Void> storeSave(@RequestBody Store store) { return storeController.save(store); }

    @PostMapping("/store/toggle/{id}")
    public Result<Void> storeToggle(@PathVariable String id) { return storeController.toggle(id); }

    @PostMapping("/store/delete/{id}")
    public Result<Void> storeDelete(@PathVariable String id) { return storeController.delete(id); }

    // warehouse & stock
    @GetMapping("/warehouse/list")
    public Result<List<Warehouse>> warehouseList(HttpSession session) { return warehouseController.list(session); }

    @PostMapping("/warehouse/save")
    public Result<Void> warehouseSave(@RequestBody Warehouse warehouse) { return warehouseController.save(warehouse); }

    @PostMapping("/warehouse/delete/{id}")
    public Result<Void> warehouseDelete(@PathVariable String id) { return warehouseController.delete(id); }

    @GetMapping("/stock/list")
    public Result<List<Stock>> stockList(@RequestParam(required = false) String warehouseId, HttpSession session) {
        return stockController.list(warehouseId, session);
    }

    // inbound
    @GetMapping("/inbound/list")
    public Result<List<InboundDoc>> inboundList() { return inboundController.list(); }

    @GetMapping("/inbound/detail/{id}")
    public Result<InboundDoc> inboundDetail(@PathVariable String id) { return inboundController.detail(id); }

    @PostMapping("/inbound/save")
    public Result<InboundDoc> inboundSave(@RequestBody InboundController.InboundDocVO vo) { return inboundController.save(vo); }

    @PostMapping("/inbound/post/{id}")
    public Result<Void> inboundPost(@PathVariable String id) { return inboundController.post(id); }

    @PostMapping("/inbound/void/{id}")
    public Result<Void> inboundVoid(@PathVariable String id) { return inboundController.voidDoc(id); }

    // transfer
    @GetMapping("/transfer/list")
    public Result<List<TransferDoc>> transferList() { return transferController.list(); }

    @GetMapping("/transfer/detail/{id}")
    public Result<TransferDoc> transferDetail(@PathVariable String id) { return transferController.detail(id); }

    @PostMapping("/transfer/save")
    public Result<TransferDoc> transferSave(@RequestBody TransferController.TransferDocVO vo) { return transferController.save(vo); }

    @PostMapping("/transfer/post/{id}")
    public Result<Void> transferPost(@PathVariable String id) { return transferController.post(id); }

    @PostMapping("/transfer/void/{id}")
    public Result<Void> transferVoid(@PathVariable String id) { return transferController.voidDoc(id); }

    // sale
    @GetMapping("/sale/list")
    public Result<List<SaleDoc>> saleList(@RequestParam(defaultValue = "1") Integer page,
                                          @RequestParam(defaultValue = "20") Integer limit,
                                          @RequestParam(required = false) String storeId) {
        return saleController.list(page, limit, storeId);
    }

    @GetMapping("/sale/detail/{id}")
    public Result<SaleDoc> saleDetail(@PathVariable String id) { return saleController.detail(id); }

    @PostMapping("/sale/save")
    public Result<SaleDoc> saleSave(@RequestBody SaleController.SaleDocVO vo) { return saleController.save(vo); }

    @PostMapping("/sale/post/{id}")
    public Result<Void> salePost(@PathVariable String id) { return saleController.post(id); }

    @PostMapping("/sale/void/{id}")
    public Result<Void> saleVoid(@PathVariable String id) { return saleController.voidDoc(id); }

    @PostMapping("/sale/delete/{id}")
    public Result<Void> saleDelete(@PathVariable String id) { return saleController.delete(id); }

    @GetMapping("/sale/storeSaleQty")
    public Result<java.util.Map<String, Integer>> saleStoreQty(@RequestParam(defaultValue = "30") Integer days) {
        return saleController.storeSaleQty(days);
    }

    // return
    @GetMapping("/return/list")
    public Result<List<ReturnDoc>> returnList() { return returnController.list(); }

    @GetMapping("/return/detail/{id}")
    public Result<ReturnDoc> returnDetail(@PathVariable String id) { return returnController.detail(id); }

    @PostMapping("/return/save")
    public Result<ReturnDoc> returnSave(@RequestBody ReturnController.ReturnDocVO vo) { return returnController.save(vo); }

    @PostMapping("/return/post/{id}")
    public Result<Void> returnPost(@PathVariable String id) { return returnController.post(id); }

    @PostMapping("/return/void/{id}")
    public Result<Void> returnVoid(@PathVariable String id) { return returnController.voidDoc(id); }
}
