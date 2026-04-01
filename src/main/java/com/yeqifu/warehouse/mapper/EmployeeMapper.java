package com.yeqifu.warehouse.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.yeqifu.warehouse.entity.Employee;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EmployeeMapper extends BaseMapper<Employee> {
}
