import {icon} from './ui';
import {authClient} from './auth';
import {language} from './i18n';
import './auth-page.css';
export const signupEnabled=true;
export function authPage(signup:boolean,notice:string,isError:boolean){
 const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 return `<main class="auth-page"><a class="auth-back" href="/" data-auth-route="/">${icon('back',22)}<span>구매로</span></a><button id="language-toggle" class="auth-language" type="button" aria-label="${language==='ko'?'Switch to English':'한국어로 전환'}">${language==='ko'?'EN':'한국어'}</button><section class="auth-card"><span class="icon-tile blue auth-icon">${icon(signup?'user':'bag',28)}</span><p class="auth-eyebrow">${signup?'회원가입':'로그인'}</p><h1>${signup?'구매를 시작할<br>준비를 해볼까요':'다시 만나서<br>반가워요'}</h1>${notice?`<p class="notification ${isError?'error':''}" role="${isError?'alert':'status'}">${escape(notice)}</p>`:''}
 <form id="${signup?'signup-form':'connect-form'}">
 ${authClient?`<label class="field" for="email"><span>아이디</span><input id="email" type="text" autocomplete="username" required maxlength="254"></label><label class="field" for="password"><span>비밀번호</span><input id="password" type="password" autocomplete="${signup?'new-password':'current-password'}" required ${signup?'minlength="12"':''}></label>${signup?'<label class="field" for="password-confirm"><span>비밀번호 확인</span><input id="password-confirm" type="password" autocomplete="new-password" required minlength="12"></label>':''}`:'<label class="field" for="token"><span>로컬 개발 접근 토큰</span><input id="token" type="password" required autocomplete="off"></label>'}
 ${signup?'<p class="auth-note">테스트 모드 · 아이디는 자유롭게, 비밀번호는 12자 이상 입력하세요.</p>':''}

 <button type="submit" class="primary"${signup&&!signupEnabled?' disabled':''}>${signup?'회원가입':'로그인'}</button>
 </form><p class="auth-switch">${signup?'이미 계정이 있나요?':'계정이 없나요?'} <a href="${signup?'/login':'/signup'}" data-auth-route="${signup?'/login':'/signup'}">${signup?'로그인':'회원가입'}</a></p></section></main>`;
}
