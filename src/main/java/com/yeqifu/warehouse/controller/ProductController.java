package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.yeqifu.sys.common.AppFileUtils;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.Product;
import com.yeqifu.warehouse.mapper.ProductMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/product")
@CrossOrigin
public class ProductController {

    @Autowired
    private ProductMapper productMapper;

    @GetMapping("/list")
    public Result<List<Product>> list() {
        List<Product> list = productMapper.selectList(
            new LambdaQueryWrapper<Product>().eq(Product::getStatus, "active")
        );
        return Result.ok(list);
    }

    @GetMapping("/detail/{id}")
    public Result<Product> detail(@PathVariable String id) {
        return Result.ok(productMapper.selectById(id));
    }

    @PostMapping("/save")
    public Result<Void> save(@RequestBody Product product) {
        normalizeProduct(product);
        if (product.getId() == null || product.getId().isEmpty()) {
            product.setId(com.yeqifu.warehouse.common.IdUtils.randomId());
            if (product.getCode() == null || product.getCode().isEmpty()) {
                product.setCode(com.yeqifu.warehouse.common.IdUtils.genCode("SP"));
            }
            if (product.getImageUrl() != null && product.getImageUrl().contains("_temp")) {
                product.setImageUrl(AppFileUtils.renameFile(product.getImageUrl()));
            }
            if (product.getStatus() == null || product.getStatus().isEmpty()) {
                product.setStatus("active");
            }
            productMapper.insert(product);
        } else {
            if (product.getImageUrl() != null && product.getImageUrl().contains("_temp")) {
                product.setImageUrl(AppFileUtils.renameFile(product.getImageUrl()));
            }
            productMapper.updateById(product);
        }
        return Result.ok();
    }

    private void normalizeProduct(Product product) {
        if (product == null) {
            return;
        }
        product.setUnit("袋");
        if (product.getBoxQty() == null || product.getBoxQty() < 1) {
            product.setBoxQty(1);
        }
    }

    @PostMapping("/toggle/{id}")
    public Result<Void> toggle(@PathVariable String id) {
        Product product = productMapper.selectById(id);
        if (product != null) {
            product.setStatus("active".equals(product.getStatus()) ? "inactive" : "active");
            productMapper.updateById(product);
        }
        return Result.ok();
    }

    @PostMapping("/delete/{id}")
    public Result<Void> delete(@PathVariable String id) {
        productMapper.deleteById(id);
        return Result.ok();
    }
}
