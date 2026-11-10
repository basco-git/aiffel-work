"""웹캠에서 YOLO 객체 탐지를 실행합니다. Q 또는 Esc로 종료합니다."""
import argparse

import cv2
from ultralytics import YOLO


def main():
    parser = argparse.ArgumentParser(description="YOLO 웹캠 객체 탐지")
    parser.add_argument("--camera", type=int, default=0, help="카메라 번호 (기본값: 0)")
    parser.add_argument("--confidence", type=float, default=0.35, help="탐지 점수 임계값")
    args = parser.parse_args()

    if not 0 <= args.confidence <= 1:
        parser.error("--confidence는 0과 1 사이여야 합니다")

    camera = cv2.VideoCapture(args.camera, cv2.CAP_DSHOW)
    if not camera.isOpened():
        camera.release()
        raise SystemExit("카메라를 열 수 없습니다. 카메라 권한과 다른 앱의 사용 여부를 확인하세요.")

    try:
        print("YOLO 모델을 불러옵니다. 처음에는 모델 파일을 다운로드합니다.", flush=True)
        model = YOLO("yolo11n.pt")
        print("카메라 창에서 Q 또는 Esc를 누르면 종료합니다. 영상은 저장하지 않습니다.", flush=True)
        while True:
            ok, frame = camera.read()
            if not ok:
                print("카메라 프레임을 읽지 못했습니다.", flush=True)
                break
            result = model.predict(frame, conf=args.confidence, verbose=False)[0]
            cv2.imshow("YOLO Webcam - Q or Esc to quit", result.plot())
            if cv2.waitKey(1) & 0xFF in (ord("q"), 27):
                break
            if cv2.getWindowProperty("YOLO Webcam - Q or Esc to quit", cv2.WND_PROP_VISIBLE) < 1:
                break
    finally:
        camera.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
