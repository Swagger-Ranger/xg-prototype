package com.xg;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@MapperScan("com.xg.**.mapper")
public class XgApplication {

    public static void main(String[] args) {
        SpringApplication.run(XgApplication.class, args);
    }
}
