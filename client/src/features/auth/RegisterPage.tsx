import { useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Check, CircleAlert, Lock, Mail, User, Users } from "lucide-react";
import AuthLayout from "./AuthLayout";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { login, register } from "../../api/auth";
import type { RegisterPayload } from "../../api/auth";
import { tokenStorage } from "../../api/client";
import { ME_KEY } from "../../hooks/useAuth";
import { getHomePath } from "../../app/paths";
import { interpretAuthError, validateEmail, validateName, validateNewPassword } from "./authHelpers";

type RegisterRole = RegisterPayload["role"];
type Field = "name" | "email" | "password";

function RoleOption({ value, selected, onSelect, icon, iconClass, title, desc }: {
  value: RegisterRole;
  selected: boolean;
  onSelect: (role: RegisterRole) => void;
  icon: ReactNode;
  iconClass: string;
  title: string;
  desc: string;
}) {
  return (
    <label className="block cursor-pointer">
      <input type="radio" name="role" value={value} checked={selected} onChange={() => onSelect(value)} className="peer sr-only" />
      <div
        className={`relative h-full rounded-2xl border p-4 transition-all duration-200 peer-focus-visible:ring-4 peer-focus-visible:ring-brand/25 ${
          selected ? "border-brand bg-brand-light/50 ring-2 ring-brand" : "border-slate-200 bg-white hover:border-slate-300"
        }`}
      >
        <span
          className={`absolute right-3 top-3 grid size-5 place-items-center rounded-full ${selected ? "bg-brand text-white" : "border-2 border-slate-300"}`}
          aria-hidden="true"
        >
          {selected && <Check className="size-3.5" />}
        </span>
        <span className={`grid size-10 place-items-center rounded-xl [&>svg]:size-5 ${iconClass}`} aria-hidden="true">
          {icon}
        </span>
        <p className="mt-3 text-sm font-bold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
      </div>
    </label>
  );
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [role, setRole] = useState<RegisterRole>("STUDENT");
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [touched, setTouched] = useState({ name: false, email: false, password: false });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const errors = {
    name: validateName(values.name),
    email: validateEmail(values.email),
    password: validateNewPassword(values.password),
  };
  const show = (field: Field) => (touched[field] || submitted ? errors[field] : undefined);

  const onChange = (field: Field) => (e: ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setFormError(null);
  };
  const onBlur = (field: Field) => () => setTouched((t) => ({ ...t, [field]: true }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (errors.name || errors.email || errors.password) return;

    const email = values.email.trim();
    setLoading(true);
    setFormError(null);
    let created = false;
    try {
      await register({ name: values.name.trim(), email, password: values.password, role });
      created = true;

      if (role === "TEACHER") {
        navigate("/pending");
        return;
      }
      // Đăng ký không trả token nên học sinh phải đăng nhập ngay sau đó
      const { user, token } = await login(email, values.password);
      tokenStorage.set(token);
      queryClient.setQueryData(ME_KEY, user);
      navigate(getHomePath(user), { replace: true });
    } catch (err) {
      const failure = interpretAuthError(err);
      if (failure.kind === "pending") navigate("/pending");
      else if (created) setFormError("Tài khoản đã được tạo nhưng chưa thể đăng nhập tự động. Hãy chuyển sang tab Đăng nhập.");
      else setFormError(failure.message);
      setLoading(false);
    }
  }

  return (
    <AuthLayout mode="register" title="Bắt đầu hành trình mới" subtitle="Tạo tài khoản miễn phí chỉ trong một phút.">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold text-slate-900">Bạn là</legend>
          <div className="grid grid-cols-2 gap-3">
            <RoleOption
              value="STUDENT"
              selected={role === "STUDENT"}
              onSelect={setRole}
              icon={<BookOpen />}
              iconClass="bg-brand-light text-brand"
              title="Học sinh"
              desc="Học và luyện tập"
            />
            <RoleOption
              value="TEACHER"
              selected={role === "TEACHER"}
              onSelect={setRole}
              icon={<Users />}
              iconClass="bg-secondary/10 text-teal-600"
              title="Giáo viên"
              desc="Quản lý lớp học"
            />
          </div>
          {role === "TEACHER" && <p className="mt-2 text-xs text-slate-500">Tài khoản giáo viên cần được quản trị viên duyệt trước khi sử dụng.</p>}
        </fieldset>

        <Input
          label="Họ và tên"
          name="name"
          autoComplete="name"
          placeholder="Nguyễn Minh Anh"
          leftIcon={<User />}
          value={values.name}
          onChange={onChange("name")}
          onBlur={onBlur("name")}
          error={show("name")}
        />
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="ten@email.com"
          leftIcon={<Mail />}
          value={values.email}
          onChange={onChange("email")}
          onBlur={onBlur("email")}
          error={show("email")}
        />
        <Input
          label="Mật khẩu"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Ít nhất 8 ký tự"
          leftIcon={<Lock />}
          value={values.password}
          onChange={onChange("password")}
          onBlur={onBlur("password")}
          error={show("password")}
        />

        {formError && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {formError}
          </div>
        )}

        <Button type="submit" fullWidth loading={loading} rightIcon={<ArrowRight />}>
          Tạo tài khoản
        </Button>
      </form>
    </AuthLayout>
  );
}