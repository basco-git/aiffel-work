import { loadGameData, type GameData } from '@tb/shared';

/** 시작할 때 한 번 읽고 검증한 게임 데이터. 형식이 틀리면 여기서 바로 예외가 난다. */
export const DATA: GameData = loadGameData();
export const CFG = DATA.config;
