/**
 * StateMachine 類別單元測試（真實實作）
 */

import StateMachine from '../../src/utils/StateMachine';

describe('StateMachine', () => {
  let stateMachine;
  let context;

  beforeEach(() => {
    stateMachine = new StateMachine();
    context = { name: 'ctx' };
    stateMachine.setContext(context);
  });

  test('初始狀態應該為空', () => {
    const fresh = new StateMachine();

    expect(fresh.states).toEqual({});
    expect(fresh.getCurrentState()).toBeNull();
    expect(fresh.getPreviousState()).toBeNull();
    expect(fresh.context).toBeNull();
  });

  test('應該正確新增狀態', () => {
    const state = { enter: jest.fn() };
    stateMachine.addState('idle', state);

    expect(stateMachine.states.idle).toBe(state);
  });

  test('新增狀態時 enter / update / exit 應該綁定到上下文', () => {
    const seen = {};
    stateMachine.addState('idle', {
      enter: function () { seen.enter = this; },
      update: function () { seen.update = this; },
      exit: function () { seen.exit = this; }
    });
    stateMachine.addState('other', {});

    stateMachine.setState('idle');
    stateMachine.update(16);
    stateMachine.setState('other');

    expect(seen.enter).toBe(context);
    expect(seen.update).toBe(context);
    expect(seen.exit).toBe(context);
  });

  test('沒有提供的生命週期方法不應該被補上', () => {
    const state = {};
    stateMachine.addState('empty', state);

    expect(state.enter).toBeUndefined();
    expect(state.update).toBeUndefined();
    expect(state.exit).toBeUndefined();
  });

  test('應該正確切換狀態並呼叫 exit / enter', () => {
    const order = [];
    stateMachine.addState('idle', {
      enter: () => order.push('idle.enter'),
      exit: () => order.push('idle.exit')
    });
    stateMachine.addState('moving', {
      enter: () => order.push('moving.enter')
    });

    expect(stateMachine.setState('idle')).toBe(true);
    expect(stateMachine.setState('moving')).toBe(true);

    expect(stateMachine.getCurrentState()).toBe('moving');
    expect(order).toEqual(['idle.enter', 'idle.exit', 'moving.enter']);
  });

  test('enter 應該收到 setState 的額外參數', () => {
    const enter = jest.fn();
    stateMachine.addState('attack', { enter });

    stateMachine.setState('attack', 'player', 42);

    expect(enter).toHaveBeenCalledWith('player', 42);
  });

  test('切換到不存在的狀態應該回傳 false 並發出警告', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(stateMachine.setState('ghost')).toBe(false);
    expect(stateMachine.getCurrentState()).toBeNull();
    expect(warn).toHaveBeenCalledWith('State "ghost" does not exist');

    warn.mockRestore();
  });

  test('重複設定相同狀態應該返回 false 且不重新進入', () => {
    const enter = jest.fn();
    const exit = jest.fn();
    stateMachine.addState('idle', { enter, exit });

    stateMachine.setState('idle');
    expect(stateMachine.setState('idle')).toBe(false);

    expect(enter).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
  });

  test('應該正確記錄上一個狀態', () => {
    stateMachine.addState('idle', {});
    stateMachine.addState('moving', {});

    stateMachine.setState('idle');
    expect(stateMachine.getPreviousState()).toBeNull();

    stateMachine.setState('moving');
    expect(stateMachine.getPreviousState()).toBe('idle');
  });

  test('應該把 delta 傳給當前狀態的 update', () => {
    const update = jest.fn();
    stateMachine.addState('idle', { update });
    stateMachine.setState('idle');

    stateMachine.update(16);

    expect(update).toHaveBeenCalledWith(16);
  });

  test('只更新當前狀態，不更新其他狀態', () => {
    const idleUpdate = jest.fn();
    const movingUpdate = jest.fn();
    stateMachine.addState('idle', { update: idleUpdate });
    stateMachine.addState('moving', { update: movingUpdate });
    stateMachine.setState('moving');

    stateMachine.update(16);

    expect(movingUpdate).toHaveBeenCalledTimes(1);
    expect(idleUpdate).not.toHaveBeenCalled();
  });

  test('沒有當前狀態時 update 不應該拋錯', () => {
    const update = jest.fn();
    stateMachine.addState('idle', { update });

    expect(() => stateMachine.update(16)).not.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  test('當前狀態沒有 update 時 update 不應該拋錯', () => {
    stateMachine.addState('idle', {});
    stateMachine.setState('idle');

    expect(() => stateMachine.update(16)).not.toThrow();
  });

  test('isInState 應該只對當前狀態回傳 true', () => {
    stateMachine.addState('idle', {});
    stateMachine.addState('moving', {});
    stateMachine.setState('idle');

    expect(stateMachine.isInState('idle')).toBe(true);
    expect(stateMachine.isInState('moving')).toBe(false);
  });

  describe('revertToPrevious', () => {
    test('沒有上一個狀態時應該回傳 false（且不嘗試切換）', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      stateMachine.addState('idle', {});
      stateMachine.setState('idle');

      expect(stateMachine.revertToPrevious()).toBe(false);
      expect(stateMachine.getCurrentState()).toBe('idle');
      expect(warn).not.toHaveBeenCalled();

      warn.mockRestore();
    });

    test('應該切回上一個狀態', () => {
      const idleEnter = jest.fn();
      stateMachine.addState('idle', { enter: idleEnter });
      stateMachine.addState('moving', {});
      stateMachine.setState('idle');
      stateMachine.setState('moving');

      expect(stateMachine.revertToPrevious()).toBe(true);
      expect(stateMachine.getCurrentState()).toBe('idle');
      expect(stateMachine.getPreviousState()).toBe('moving');
      expect(idleEnter).toHaveBeenCalledTimes(2);
    });
  });

  describe('reset', () => {
    test('應該呼叫當前狀態的 exit 並清空狀態', () => {
      const exit = jest.fn();
      stateMachine.addState('idle', {});
      stateMachine.addState('moving', { exit });
      stateMachine.setState('idle');
      stateMachine.setState('moving');

      stateMachine.reset();

      expect(exit).toHaveBeenCalledTimes(1);
      expect(stateMachine.getCurrentState()).toBeNull();
      expect(stateMachine.getPreviousState()).toBeNull();
    });

    test('沒有當前狀態或沒有 exit 時 reset 不應該拋錯', () => {
      expect(() => stateMachine.reset()).not.toThrow();

      stateMachine.addState('idle', {});
      stateMachine.setState('idle');
      expect(() => stateMachine.reset()).not.toThrow();
      expect(stateMachine.getCurrentState()).toBeNull();
    });
  });
});
