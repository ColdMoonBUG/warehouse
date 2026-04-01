package com.yeqifu.warehouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.io.Serializable;
import java.util.Date;

@Data
@TableName("wh_static_json")
public class StaticJson implements Serializable {
    @TableId(type = IdType.INPUT)
    private String jsonKey;
    private String content;
    private Date updatedAt;
}
