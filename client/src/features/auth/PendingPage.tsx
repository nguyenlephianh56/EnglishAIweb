import { Navigate } from "react-router-dom";
import PlaceholderPage from "../../components/layout/PlaceholderPage";
import Button from "../../components/ui/Button";
import { useAuth } from "../../hooks/useAuth";
import { getHomePath } from "../../app/paths";

export default function PendingPage() {
  const { user } = useAuth();
  // Đã được duyệt thì không còn lý do ở lại trang này
  if (user && user.status !== "PENDING") return <Navigate to={getHomePath(user)} replace />;

  return (
    <PlaceholderPage
      title="Đang chờ duyệt"
      description="Tài khoản giáo viên cần được quản trị viên duyệt trước khi sử dụng. Bạn có thể đăng nhập ngay sau khi được duyệt."
    >
      <Button to="/" variant="outline">
        Về trang chủ
      </Button>
    </PlaceholderPage>
  );
}