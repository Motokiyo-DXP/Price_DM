"use client";

import { useState, type InputHTMLAttributes } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="password-input">
      <input {...props} type={visible ? "text" : "password"} />
      <button
        aria-label={visible ? "パスワードを非表示にする" : "パスワードを表示する"}
        aria-pressed={visible}
        className="password-visibility-toggle"
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        {visible ? "非表示" : "表示"}
      </button>
    </span>
  );
}
