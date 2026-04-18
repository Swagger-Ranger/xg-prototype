package com.xg.platform.auth.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class LoginResponse {

    private String token;
    private String refreshToken;
    private CurrentUserView user;
}
