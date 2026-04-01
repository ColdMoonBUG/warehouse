package com.yeqifu.warehouse.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.yeqifu.warehouse.common.Result;
import com.yeqifu.warehouse.entity.Employee;
import com.yeqifu.warehouse.mapper.EmployeeMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/employee")
@CrossOrigin
public class EmployeeController {

    @Autowired
    private EmployeeMapper employeeMapper;

    @GetMapping("/list")
    public Result<List<Employee>> list() {
        List<Employee> list = employeeMapper.selectList(
            new LambdaQueryWrapper<Employee>().eq(Employee::getStatus, "active")
        );
        return Result.ok(list);
    }

    @GetMapping("/detail/{id}")
    public Result<Employee> detail(@PathVariable String id) {
        return Result.ok(employeeMapper.selectById(id));
    }

    @PostMapping("/save")
    public Result<Void> save(@RequestBody Employee employee) {
        if (employee.getId() == null || employee.getId().isEmpty()) {
            employee.setId(com.yeqifu.warehouse.common.IdUtils.randomId());
            if (employee.getStatus() == null || employee.getStatus().isEmpty()) {
                employee.setStatus("active");
            }
            employeeMapper.insert(employee);
        } else {
            employeeMapper.updateById(employee);
        }
        return Result.ok();
    }

    @PostMapping("/toggle/{id}")
    public Result<Void> toggle(@PathVariable String id) {
        Employee employee = employeeMapper.selectById(id);
        if (employee != null) {
            employee.setStatus("active".equals(employee.getStatus()) ? "inactive" : "active");
            employeeMapper.updateById(employee);
        }
        return Result.ok();
    }

    @PostMapping("/delete/{id}")
    public Result<Void> delete(@PathVariable String id) {
        employeeMapper.deleteById(id);
        return Result.ok();
    }
}
