/** Standard API response envelope */
export interface ApiResponse<T = unknown> {
  code: string;
  data: T;
  message: string;
}

/** Paginated response */
export interface PageResult<T = unknown> {
  data: T[];
  total: number;
  page: number;
  size: number;
}

/** Page query params */
export interface PageQuery {
  page?: number;
  size?: number;
}
