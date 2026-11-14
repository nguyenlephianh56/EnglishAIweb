import { useState } from "react";
import type { FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, ShieldCheck, User } from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { updateProfile } from "../../api/users";
import { getErrorMessage } from "../../api/client";
import { ME_KEY } from "../../hooks/useAuth";
import { validateName } from "../auth/authHelpers";
import { BACKEND_READY } from "./config";
import { roleLabel } from "./ProfileHeaderCard";
import Notice from "./Notice";
import type { AuthUser } from "../../types/auth";

export default function InfoTab({ user }: { user: AuthUser }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(user.name);
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const nameError = validateName(name);
  const dirty = name.trim() !== user.name;
  const ready = BACKEND_READY.updateProfile;
  const canSave = ready && dirty && !nameError && !loading;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!canSave) return;

    setLoading(true);
    setNotice(null);
    try {
      const updated = await updateProfile({ name: name.trim() });
      queryClient.setQueryData(ME_KEY, updated); // tên mới hiện ngay ở topbar và sidebar
      setName(updated.name);
      setNotice({ type: "success", text: "Đã cập nhật thông tin cá nhân." });
    } catch (err) {
      setNotice({ type: "error", text: getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <Input
        label="Họ và tên"
        name="name"
        autoComplete="name"
        leftIcon={<User />}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setNotice(null);
        }}
        onBlur={() => setTouched(true)}
        error={touched ? nameError : undefined}
      />

      <div>
        <Input label="Email" name="email" type="email" leftIcon={<Mail />} value={user.email} readOnly aria-describedby="email-note" />
        <p id="email-note" className="mt-1.5 text-xs text-slate-500">
          Email không thể thay đổi.
        </p>
      </div>

      <Input label="Vai trò" name="role" leftIcon={<ShieldCheck />} value={roleLabel(user.role)} readOnly />

      {notice && <Notice type={notice.type}>{notice.text}</Notice>}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <span title={ready ? undefined : "Sắp ra mắt"}>
          <Button type="submit" loading={loading} disabled={!canSave}>
            Lưu thay đổi
          </Button>
        </span>
        {!ready && <p className="text-xs font-semibold text-slate-500">Sắp ra mắt: hiện chưa lưu được thay đổi.</p>}
      </div>
    </form>
  );
}
