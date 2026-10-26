import type { ChangeEventHandler, RefObject } from "react";
import { ImagePlus } from "@/components/ui/material-icons";
import { Button } from "@/components/ui/button";

export function ImageUpload({
  inputRef,
  image,
  disabled,
  onChange,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  image: string;
  disabled?: boolean;
  onChange: ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <div className="w-64 max-w-full">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        disabled={disabled}
        onChange={onChange}
        aria-label="카메라 이미지 파일"
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        aria-label={image ? "카메라 이미지 변경" : "카메라 이미지 업로드"}
        className="relative aspect-square h-auto w-full flex-col overflow-hidden rounded-xl border-dashed p-0"
      >
        {image ? (
          <img
            src={image}
            alt="적용할 카메라 이미지"
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <>
            <ImagePlus
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <span>사진 업로드</span>
          </>
        )}
      </Button>
    </div>
  );
}
