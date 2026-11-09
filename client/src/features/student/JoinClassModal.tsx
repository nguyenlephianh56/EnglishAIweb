import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { CircleAlert, Hash } from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import { joinClass } from "../../api/classes";
import { getErrorMessage } from "../../api/client";
import type { JoinedClass } from "../../types/student";

interface JoinClassModalProps {
  open: boolean;
  onClose: () => void;
  onJoined: (joined: JoinedClass) => void;
}

const CODE_LENGTH = 6;

export default function JoinClassModal({ open, onClose, onJoined }: JoinClassModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mỗi lần mở: xóa dữ liệu cũ và đưa con trỏ vào ô nhập
  useEffect(() => {
    if (!open) return;
    setCode("");
    setSubmitted(false);
    setError(null);
    setLoading(false);
    inputRef.current?.focus();
  }, [open]);

  const fieldError = submitted && code.length !== CODE_LENGTH ? "Mã lớp phải gồm đúng 6 ký tự chữ hoặc số" : undefined;

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    // Tự viết HOA, bỏ ký tự lạ
    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH));
    setError(null);
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (code.length !== CODE_LENGTH) return;

    setLoading(true);
    setError(null);
    try {
      onJoined(await joinClass(code));
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Tham gia lớp" description="Nhập mã lớp gồm 6 ký tự do giáo viên cung cấp.">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          ref={inputRef}
          label="Mã lớp"
          name="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={CODE_LENGTH}
          placeholder="Ví dụ: AB12CD"
          leftIcon={<Hash />}
          value={code}
          onChange={onChange}
          error={fieldError}
        />

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button type="submit" loading={loading}>
            Tham gia
          </Button>
        </div>
      </form>
    </Modal>
  );
}
