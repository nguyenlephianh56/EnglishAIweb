import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Lock, LogOut } from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { changePassword } from "../../api/users";
import { getErrorMessage } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import { validateNewPassword } from "../auth/authHelpers";
import { BACKEND_READY } from "./config";
import Notice from "./Notice";

type Field = "current" | "next" | "confirm";

export default function SecurityTab() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [values, setValues] = useState({ current: "", next: "", confirm: "" });
  const [touched, setTouched] = useState<Record<Field, boolean>>({ current: false, next: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const errors: Record<Field, string | undefined> = {
    current: values.current ? undefined : "Vui lòng nhập mật khẩu hiện tại",
    next: validateNewPassword(values.next) ?? (values.next === values.current ? "Mật khẩu mới phải khác mật khẩu hiện tại" : undefined),
    confirm: !values.confirm ? "Vui lòng nhập lại mật khẩu mới" : values.confirm !== values.next ? "Mật khẩu nhập lại không khớp" : undefined,
  };
  const ready = BACKEND_READY.changePassword;
  const valid = !errors.current && !errors.next && !errors.confirm;
  const canSubmit = ready && valid && !loading;
  const shown = (f: Field) => (touched[f] ? errors[f] : undefined);

  const onChange = (f: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [f]: e.target.value }));
    setNotice(null);
  };
  const onBlur = (f: Field) => () => setTouched((t) => ({ ...t, [f]: true }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ current: true, next: true, confirm: true });
    if (!canSubmit) return;

    setLoading(true);
    setNotice(null);
    try {
      await changePassword({ currentPassword: values.current, newPassword: values.next });
      setValues({ current: "", next: "", confirm: "" });
      setTouched({ current: false, next: false, confirm: false });
      setNotice({ type: "success", text: "Đã đổi mật khẩu thành công." });
    } catch (err) {
      setNotice({ type: "error", text: getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/", { replace: true });
  }

  return (
    <div>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <Input
          label="Mật khẩu hiện tại"
          name="current-password"
          type="password"
          autoComplete="current-password"
          leftIcon={<Lock />}
          value={values.current}
          onChange={onChange("current")}
          onBlur={onBlur("current")}
          error={shown("current")}
        />
        <Input
          label="Mật khẩu mới"
          name="new-password"
          type="password"
          autoComplete="new-password"
          placeholder="Ít nhất 8 ký tự"
          leftIcon={<KeyRound />}
          value={values.next}
          onChange={onChange("next")}
          onBlur={onBlur("next")}
          error={shown("next")}
        />
        <Input
          label="Nhập lại mật khẩu mới"
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          leftIcon={<KeyRound />}
          value={values.confirm}
          onChange={onChange("confirm")}
          onBlur={onBlur("confirm")}
          error={shown("confirm")}
        />

        {notice && <Notice type={notice.type}>{notice.text}</Notice>}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <span title={ready ? undefined : "Sắp ra mắt"}>
            <Button type="submit" loading={loading} disabled={!canSubmit}>
              Đổi mật khẩu
            </Button>
          </span>
          {!ready && <p className="text-xs font-semibold text-slate-500">Sắp ra mắt: hiện chưa đổi được mật khẩu.</p>}
        </div>
      </form>

      <div className="mt-8 border-t border-slate-100 pt-6">
        <Button variant="outline" leftIcon={<LogOut />} onClick={handleLogout}>
          Đăng xuất
        </Button>
      </div>
    </div>
  );
}
