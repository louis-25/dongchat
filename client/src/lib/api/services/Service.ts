/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuthResponseDto } from '../models/AuthResponseDto';
import type { LoginDto } from '../models/LoginDto';
import type { Message } from '../models/Message';
import type { RegisterDto } from '../models/RegisterDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class Service {
    /**
     * 회원가입
     * 새로운 사용자를 등록합니다.
     * @param requestBody
     * @returns any 회원가입 성공
     * @throws ApiError
     */
    public static authControllerRegister(
        requestBody: RegisterDto,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/register',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `이미 존재하는 사용자`,
            },
        });
    }
    /**
     * 로그인
     * 사용자 인증 후 JWT 토큰을 발급합니다.
     * @param requestBody
     * @returns AuthResponseDto 로그인 성공
     * @throws ApiError
     */
    public static authControllerLogin(
        requestBody: LoginDto,
    ): CancelablePromise<AuthResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/login',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `아이디 또는 비밀번호 오류`,
            },
        });
    }
    /**
     * 메시지 조회
     * 저장된 채팅 메시지를 페이지네이션하여 조회합니다.
     * @param page 페이지 번호
     * @param limit 페이지당 항목 수
     * @returns Message 메시지 목록
     * @throws ApiError
     */
    public static chatControllerGetMessages(
        page: number = 1,
        limit: number = 50,
    ): CancelablePromise<Array<Message>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/messages',
            query: {
                'page': page,
                'limit': limit,
            },
        });
    }
}
