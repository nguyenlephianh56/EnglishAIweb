import PlaceholderPage from "../../components/layout/PlaceholderPage";
import Button from "../../components/ui/Button";

export default function LoginPage() {
  return (
    <PlaceholderPage title="Đăng nhập" description="Trang đăng nhập đang được hoàn thiện.">
      <Button to="/register">Tạo tài khoản</Button>
      <Button to="/" variant="ghost">
        Về trang chủ
      </Button>
    </PlaceholderPage>
  );
}
