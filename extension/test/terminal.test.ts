// The page script on the grid's own terminal page (AM2; UNPROVEN ON THE GRID), over a fake page: it
// reads the title only and says once that the shell is up when the title, changed since the script
// loaded, names the account first (D31); it types exactly the login-setup line, into xterm.js's helper
// textarea, as a paste event and then an Enter input event (D30), and nothing at all into an older
// terminal or for any other line.
import { describe, expect, it } from 'vitest';
import { commands } from '../src/core/contract';
import { titleSaysShellUp, typeLoginSetupLine, watchShellTitle, type TerminalPage, type TitleSource } from '../src/core/terminal';

const LINE = commands.loginSetup('/rs/rs_grp_oschome/shared/beethoven/hpcworker/current');

function titlePage(initial: string) {
  let title = initial;
  const cbs = new Set<() => void>();
  const src: TitleSource = {
    get title() {
      return title;
    },
    onChange(cb) {
      cbs.add(cb);
      return () => cbs.delete(cb);
    },
  };
  return { src, set: (t: string) => ((title = t), cbs.forEach((c) => c())), listeners: () => cbs.size };
}

describe('the shell-up sign', () => {
  it('a title changed since load that names the account first; the password prompt changes no title', () => {
    expect(titleSaysShellUp('Shell', 'st1234@warrior:~', 'st1234')).toBe(true);
    expect(titleSaysShellUp('st1234@warrior:~', 'st1234@warrior:~', 'st1234')).toBe(false);
    expect(titleSaysShellUp('Shell', 'Shell', 'st1234')).toBe(false);
    expect(titleSaysShellUp('Shell', 'go2432@warrior:~', 'st1234')).toBe(false);
    expect(titleSaysShellUp('Shell', 'st1234@warrior:~', '')).toBe(false);
    // a prompt in the title, should anything put one there, is not the shell's own title
    expect(titleSaysShellUp('Shell', "st1234@login1's password: ", 'st1234')).toBe(false);
    expect(titleSaysShellUp('Shell', 'st1234@warrior.nas.grid.wayne.edu:/rs/x', 'st1234')).toBe(true);
  });

  it('fires once, then stops listening; carries no title text', () => {
    const p = titlePage('Shell');
    let ups = 0;
    watchShellTitle(p.src, 'st1234', () => ups++);
    p.set("st1234@login1's password: ");
    expect(ups).toBe(0);
    p.set('st1234@warrior:~');
    p.set('st1234@warrior:~/x');
    expect(ups).toBe(1);
    expect(p.listeners()).toBe(0);
  });

  it('measures the change from the title when the script loaded', () => {
    const p = titlePage('Shell');
    p.set('st1234@warrior:~');
    let ups = 0;
    // the page script loaded on "Shell"; the watch began after the shell came up
    watchShellTitle(p.src, 'st1234', () => ups++, 'Shell');
    expect(ups).toBe(1);
  });
});

describe('typing the one line', () => {
  function page(withTextarea: boolean) {
    const events: unknown[] = [];
    let focused = false;
    const pg: TerminalPage = {
      helperTextarea: () => (withTextarea ? { focus: () => void (focused = true), dispatchEvent: (e: unknown) => (events.push(e), true) } : null),
      pasteEvent: (text) => ({ type: 'paste', text }),
      enterEvent: () => ({ type: 'input', data: '\r', inputType: 'insertText' }),
    };
    return { pg, events, focused: () => focused };
  }

  it('pastes the line into xterm.js\'s helper textarea, then presses Enter', () => {
    const p = page(true);
    expect(typeLoginSetupLine(p.pg, LINE)).toEqual({ typed: true, how: 'xterm' });
    expect(p.focused()).toBe(true);
    expect(p.events).toEqual([
      { type: 'paste', text: LINE },
      { type: 'input', data: '\r', inputType: 'insertText' },
    ]);
  });

  it('types nothing into an older terminal (the student pastes instead)', () => {
    const p = page(false);
    expect(typeLoginSetupLine(p.pg, LINE)).toEqual({ typed: false, how: 'unsupported', why: 'unsupported' });
    expect(p.events).toEqual([]);
  });

  it('refuses any line but the login-setup line', () => {
    for (const bad of ['rm -rf ~', `${LINE}; rm -rf ~`, `${LINE} --remove`, 'mypassword', '', undefined]) {
      const p = page(true);
      expect(typeLoginSetupLine(p.pg, bad), String(bad)).toEqual({ typed: false, how: 'unsupported', why: 'refused' });
      expect(p.events).toEqual([]);
    }
  });
});
