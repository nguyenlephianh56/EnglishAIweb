import PlaceholderPage from "../../components/layout/PlaceholderPage";
import Button from "../../components/ui/Button";

export default function RegisterPage() {
  return (
    <PlaceholderPage title="Đăng ký" description="Trang đăng ký đang được hoàn thiện.">
      <Button to="/login">Tôi đã có tài khoản</Button>
      <Button to="/" variant="ghost">
        Về trang chủ
      </Button>
    </PlaceholderPage>
  );
}
