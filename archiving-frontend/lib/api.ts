import axios from "axios";

// 1. Add a helper function to get the cookie
function getCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(";").shift() || null;
  }
  return null;
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "https://archiving-backend.onrender.com/",
  withCredentials: true, // This correctly sends cookies
});

// 2. Add an interceptor to add the CSRF token header
api.interceptors.request.use(
  (config) => {
    // Read the CSRF token from the cookie
    const csrfToken = getCookie("csrf_access_token");

    if (csrfToken) {
      config.headers["X-CSRF-TOKEN"] = csrfToken;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;