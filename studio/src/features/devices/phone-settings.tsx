import { useEffect, useState } from "react";
import { API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
const states = [
  ["home", "연결"],
  ["roaming", "로밍"],
  ["unregistered", "연결 끊김"],
  ["searching", "검색 중"],
  ["denied", "접속 거부"],
];
export function PhoneSettings({
  serial,
  viewer,
  canControl,
}: {
  serial: string;
  viewer: string;
  canControl: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [carrier, setCarrier] = useState("");
  const [voice, setVoice] = useState("");
  const [network, setNetwork] = useState("");
  const endpoint = `${API}/phone-settings?${new URLSearchParams({ serial, viewer })}`;
  useEffect(() => {
    if (!canControl) return;
    const controller = new AbortController();
    void fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "설정을 불러오지 못했어요.");
        setSupported(data.supported);
        setMessage(data.reason || "");
        setCarrier(data.carrier || "");
        setVoice(data.voice || "");
        setNetwork(data.network || "");
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      });
    return () => controller.abort();
  }, [endpoint, canControl]);
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, carrier, voice, network }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error ||
            "일부 설정을 적용하지 못했어요. 기기 상태를 확인해 주세요.",
        );
      setMessage(
        "설정을 적용했어요. 앱이 이전 값을 보관하고 있다면 다시 열어 주세요.",
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
        테스트 기기의 전화번호와 통신 상태를 설정해요. 통신사 표시 이름은 실제
        유심 가입망을 변경하지 않아요.
      </p>
      {!canControl ? (
        <p role="status">기기를 점유한 뒤 이용해 주세요.</p>
      ) : (
        supported && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="device-phone">전화번호</Label>
              <Input
                id="device-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="변경할 번호 · 비우면 유지"
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="device-carrier">통신사 표시 이름</Label>
              <Input
                id="device-carrier"
                value={carrier}
                onChange={(event) => setCarrier(event.target.value)}
                placeholder="SKT, KT, LGU"
                disabled={busy}
              />
            </div>
            {(
              [
                ["voice", "음성 연결", voice, setVoice],
                ["network", "데이터 연결", network, setNetwork],
              ] as const
            ).map(([id, label, value, setValue]) => (
              <div className="space-y-2" key={id}>
                <Label htmlFor={`phone-${id}`}>{label}</Label>
                <Select value={value} onValueChange={setValue} disabled={busy}>
                  <SelectTrigger id={`phone-${id}`}>
                    <SelectValue placeholder="현재 설정 유지" />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map(([key, name]) => (
                      <SelectItem key={key} value={key}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <Button disabled={busy} type="submit">
              {busy ? "적용 중" : "적용"}
            </Button>
          </form>
        )
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
