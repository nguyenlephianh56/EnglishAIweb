import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CircleAlert, Lock, Mail } from "lucide-react";
import AuthLayout from "./AuthLayout";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { login } from "../../api/auth";
import { tokenStorage } from "../../api/client";
import { ME_KEY } from "../../hooks/useAuth";
import { getHomePath } from "../../app/paths";
import { interpretAuthError, validateEmail, validateLoginPassword } from "./authHelpers";

export default function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [values, setValues] = useState({ email: "", password: "" });
  const [touched, setTouched] = useState({ email: false, password: false });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const errors = { email: validateEmail(values.email), password: validateLoginPassword(values.password) };
  const show = (field: "email" | "password") => (touched[field] || submitted ? errors[field] : undefined);

  const onChange = (field: "email" | "password") => (e: ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setFormError(null);
  };
  const onBlur = (field: "email" | "password") => () => setTouched((t) => ({ ...t, [field]: true }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (errors.email || errors.password) return;

    setLoading(true);
    setFormError(null);
    try {
      const { user, token } = await login(values.email.trim(), values.password);
      tokenStorage.set(token);
      queryClient.setQueryData(ME_KEY, user);
      navigate(getHomePath(user), { replace: true });
    } catch (err) {
      const failure = interpretAuthError(err);
      if (failure.kind === "pending") navigate("/pending");
      else setFormError(failure.message);
      setLoading(false);
    }
  }

  return (
    <AuthLayout mode="login" title="Chào mừng bạn quay lại" subtitle="Đăng nhập để tiếp tục hành trình học của bạn.">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
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
          autoComplete="current-password"
          placeholder="Nhập mật khẩu"
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
          Đăng nhập
        </Button>

        <p className="text-center text-sm text-slate-600">
          Chưa có tài khoản?{" "}
          <Link to="/register" className="rounded font-bold text-brand hover:text-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25">
            Đăng ký
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}