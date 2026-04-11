package com.yeqifu.sys.controller;

import cn.hutool.core.date.DateUtil;
import com.yeqifu.sys.common.AppFileUtils;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

/**
 * @Author: 落亦-
 * @Date: 2019/12/15 23:46
 */
@RestController
@RequestMapping({"file", "api/file"})
@CrossOrigin(origins = "*", allowCredentials = "true")
public class FileController {

    /**
     * 文件上传
     * @param mf
     * @return
     */
    @RequestMapping("uploadFile")
    public ResponseEntity<Map<String,Object>> uploadFile(MultipartFile mf) {
        if (mf == null || mf.isEmpty()) {
            return ResponseEntity.badRequest().body(errorBody("请选择图片"));
        }
        String oldName = mf.getOriginalFilename();
        if (oldName == null || !oldName.contains(".")) {
            return ResponseEntity.badRequest().body(errorBody("文件名无效"));
        }
        //1.根据旧的文件名生成新的文件名
        String newName=AppFileUtils.createNewFileName(oldName);
        //2.得到当前日期的字符串
        String dirName= DateUtil.format(new Date(), "yyyy-MM-dd");
        //3.构造文件夹
        File dirFile=new File(AppFileUtils.UPLOAD_PATH,dirName);
        //4.判断当前文件夹是否存在
        if(!dirFile.exists() && !dirFile.mkdirs()) {
            return ResponseEntity.status(500).body(errorBody("创建上传目录失败"));
        }
        //5.构造文件对象
        File file=new File(dirFile, newName+"_temp");
        //6.把mf里面的图片信息写入file
        try {
            mf.transferTo(file);
        } catch (IllegalStateException | IOException e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(errorBody("上传失败"));
        }
        Map<String,Object> map=new HashMap<String, Object>();
        map.put("path",dirName+"/"+newName+"_temp");
        return ResponseEntity.ok(map);
    }

    private Map<String, Object> errorBody(String msg) {
        Map<String,Object> map=new HashMap<String, Object>();
        map.put("msg", msg);
        return map;
    }

    /**
     * 图片下载
     */
    @RequestMapping("showImageByPath")
    public ResponseEntity<Object> showImageByPath(String path) {
        return AppFileUtils.createResponseEntity(path);
    }

}
