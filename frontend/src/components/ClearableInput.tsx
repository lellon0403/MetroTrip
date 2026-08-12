"use client";

import { Eye, EyeOff, X } from "lucide-react";
import { type ComponentProps, useRef, useState } from "react";

type ClearableInputProps = ComponentProps<"input">;

const nonClearableTypes = new Set(["checkbox", "radio", "file", "hidden", "color", "range", "submit", "button", "reset", "date", "time", "datetime-local", "month", "week"]);

export function ClearableInput({ className, onChange, type = "text", value, defaultValue, disabled, readOnly, ...props }: ClearableInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uncontrolledHasValue, setUncontrolledHasValue] = useState(() => String(defaultValue ?? "").length > 0);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = type === "password";
  const canClear = !disabled && !readOnly && !nonClearableTypes.has(type);
  const hasValue = value !== undefined ? String(value).length > 0 : uncontrolledHasValue;

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    setUncontrolledHasValue(event.currentTarget.value.length > 0);
    onChange?.(event);
  }

  function clearValue() {
    const input = inputRef.current;
    if (!input) return;

    const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (nativeValueSetter) nativeValueSetter.call(input, "");
    else input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    setUncontrolledHasValue(false);
    input.focus();
  }

  return (
    <span className={`clearableInput${isPassword ? " isPassword" : ""}`}>
      <input
        {...props}
        ref={inputRef}
        className={className}
        type={isPassword && passwordVisible ? "text" : type}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        readOnly={readOnly}
        onChange={handleChange}
      />
      {canClear && hasValue ? <button type="button" className="inputIconButton inputClearButton" onClick={clearValue} aria-label="입력 내용 지우기"><X size={16} aria-hidden /></button> : null}
      {isPassword ? <button type="button" className="inputIconButton inputPasswordButton" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}>{passwordVisible ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}</button> : null}
    </span>
  );
}
