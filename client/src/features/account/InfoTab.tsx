import { Mail, ShieldCheck, User } from "lucide-react";
import Input from "../../components/ui/Input";
import { roleLabel } from "./ProfileHeaderCard";
import type { AuthUser } from "../../types/auth";

export default function InfoTab({ user }: { user: AuthUser }) {
  return (
    <div className="space-y-5">
      <Input label="Họ và tên" name="name" autoComplete="name" leftIcon={<User />} value={user.name} readOnly />

      <div>
        <Input label="Email" name="email" type="email" leftIcon={<Mail />} value={user.email} readOnly aria-describedby="email-note" />
        <p id="email-note" className="mt-1.5 text-xs text-slate-500">
          Email không thể thay đổi.
        </p>
      </div>

      <Input label="Vai trò" name="role" leftIcon={<ShieldCheck />} value={roleLabel(user.role)} readOnly />
    </div>
  );
}