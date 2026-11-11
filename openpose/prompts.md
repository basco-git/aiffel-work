# 포즈 생성 프롬프트와 비교 기록

아래 내용은 [03번 실험 설정](experiments/03-studio-steps30-control1/experiment_settings.json)과 실제 결과를 기준으로 정리했습니다. 재실행 결과가 아닌 기존 실험 기록입니다.

| 결과 | 포즈 | 프롬프트 |
|---|---|---|
| [A1](samples/result_A1.png) | [A](samples/pose_A.png) · [뼈대](samples/skeleton_A.png) | `a single dancer in casual clothes in a bright dance studio, full body, photograph` |
| [A2](samples/result_A2.png) | [A](samples/pose_A.png) · [뼈대](samples/skeleton_A.png) | `a single astronaut in a space station, full body, cinematic illustration` |
| [B1](samples/result_B1.png) | [B](samples/pose_B.png) · [뼈대](samples/skeleton_B.png) | `a single dancer in casual clothes in a bright dance studio, full body, photograph` |

- 공통 설정: seed 42, steps 30, guidance scale 7.5, ControlNet 강도 1.0.
- 모델: `stable-diffusion-v1-5/stable-diffusion-v1-5`, `lllyasviel/control_v11p_sd15_openpose`.
- A1과 A2는 같은 뼈대에서 댄서 사진과 우주인 일러스트로 달라졌습니다.
- A1과 B1은 같은 댄서 프롬프트에서 뼈대를 바꿨지만, B의 몸 앞 팔 동작이 정확하게 재현되지는 않았습니다.
- A의 전신 결과에서 얼굴이 작고 흐릿했습니다. 별도 B 실험에서는 조건 적용 종료 시점을 바꿔도 여분의 팔이 남았습니다. [비교 결과](experiments/05-light-pose-b/)

참조 A·B는 기존 README에 기록된 AI 생성 스튜디오 이미지입니다. 모델 사용 조건과 최종 공개 범위는 제출 전 확인이 필요합니다.
