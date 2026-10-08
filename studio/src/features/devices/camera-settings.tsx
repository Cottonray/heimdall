import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { API } from "@/lib/api";
export function CameraSettings({
  serial,
  viewer,
  canControl,
}: {
  serial: string;
  viewer: string;
  canControl: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [reason, setReason] = useState("");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const endpoint = `${API}/camera?${new URLSearchParams({ serial, viewer })}`;
  useEffect(() => {
    if (!canControl) return;
    const controller = new AbortController();
    void fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "카메라 설정을 확인하지 못했어요.");
        setSupported(data.supported);
        setReason(data.reason || "");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setReason(error.message);
      });
    return () => controller.abort();
  }, [endpoint, canControl]);
  async function upload() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "이미지를 적용하지 못했어요.");
      setMessage(
        "이미지를 적용했어요. 앱에서 카메라를 닫았다 다시 열어 주세요.",
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4 p-4">
      <p className="text-sm text-muted-foreground">
        업로드한 이미지를 후면 카메라에 표시해요. PNG·JPEG, 512KB 이하·가로세로
        2048px 이하를 지원해요.
      </p>
      {!canControl ? (
        <p role="status">기기를 점유한 뒤 이용해 주세요.</p>
      ) : !supported ? (
        <p role="status">{reason || "카메라 설정을 확인하고 있어요."}</p>
      ) : (
        <>
          <Label htmlFor="camera-image">카메라 이미지</Label>
          <Input
            id="camera-image"
            type="file"
            accept="image/png,image/jpeg"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              setImage("");
              setMessage("");
              if (!file) return;
              if (
                file.size > 512 * 1024 ||
                !["image/png", "image/jpeg"].includes(file.type)
              ) {
                setMessage(
                  "512KB 이하의 PNG 또는 JPEG 이미지를 선택해 주세요.",
                );
                return;
              }
              const reader = new FileReader();
              reader.onload = () => setImage(String(reader.result));
              reader.onerror = () => setMessage("파일을 읽지 못했어요.");
              reader.readAsDataURL(file);
            }}
          />
          {image && (
            <img
              src={image}
              alt="적용할 카메라 이미지"
              className="max-h-80 max-w-full rounded-md border object-contain"
            />
          )}
          <Button
            disabled={!image || busy || !canControl}
            onClick={() => void upload()}
          >
            {busy ? "적용 중" : "적용"}
          </Button>
        </>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
