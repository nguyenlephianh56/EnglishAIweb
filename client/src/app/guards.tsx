import { Navigate, Outlet } from "react-router-dom";
import FullScreenLoader from "../components/ui/FullScreenLoader";
import { useAuth } from "../hooks/useAuth";
import { getHomePath } from "./paths";
import type { Role } from "../types/auth";

/** Dành cho "/", "/login", "/register": đã có phiên hợp lệ thì chuyển thẳng tới trang vai trò. */
export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullScreenLoader />;
  if (user) return <Navigate to={getHomePath(user)} replace />;
  return <Outlet />;
}

/** Chặn trang theo vai trò: chưa đăng nhập về /login, sai vai trò về trang của mình. */
export function RequireRole({ role }: { role: Role }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status === "PENDING" || user.role !== role) return <Navigate to={getHomePath(user)} replace />;
  return <Outlet />;
}