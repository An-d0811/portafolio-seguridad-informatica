import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api"
});

export function setAuthToken(token: string) {
  localStorage.setItem("access_token", token);
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}

const storedToken = localStorage.getItem("access_token");
if (storedToken) {
  api.defaults.headers.common.Authorization = `Bearer ${storedToken}`;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      delete api.defaults.headers.common.Authorization;
      window.dispatchEvent(new Event("auth:logout"));
    }
    return Promise.reject(error);
  }
);
