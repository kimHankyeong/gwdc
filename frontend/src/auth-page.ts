import {authClient} from './auth';
import './auth-page.css';
export const signupEnabled=import.meta.env.VITE_PUBLIC_SIGNUP_ENABLED==='true';
export function authPage(signup:boolean,notice:string,isError:boolean){
 const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 return `<main class="auth-page"><a class="auth-back" href="/" data-auth-route="/">← 구매로</a><section class="auth-card"><h1>${signup?'회원가입':'로그인'}</h1>${notice?`<p class="notification ${isError?'error':''}" role="${isError?'alert':'status'}">${escape(notice)}</p>`:''}
 <form id="${signup?'signup-form':'connect-form'}">
 ${authClient?`<label class="field" for="email"><span>이메일</span><input id="email" type="email" autocomplete="username" required maxlength="254"></label><label class="field" for="password"><span>비밀번호</span><input id="password" type="password" autocomplete="${signup?'new-password':'current-password'}" required ${signup?'minlength="12"':''}></label>${signup?'<label class="field" for="password-confirm"><span>비밀번호 확인</span><input id="password-confirm" type="password" autocomplete="new-password" required minlength="12"></label>':''}`:'<label class="field" for="token"><span>로컬 개발 접근 토큰</span><input id="token" type="password" required autocomplete="off"></label>'}
 ${signup?'<p class="auth-note">12자 이상 입력하세요. 가입 후 이메일 인증이 필요합니다.</p>':''}
 ${signup&&!signupEnabled?'<p class="auth-status" role="status">인증 메일 설정 전이라 신규 가입은 아직 사용할 수 없습니다.</p>':''}
 <button type="submit" class="primary"${signup&&!signupEnabled?' disabled':''}>${signup?'회원가입':'로그인'}</button>
 </form><p class="auth-switch">${signup?'이미 계정이 있나요?':'계정이 없나요?'} <a href="${signup?'/login':'/signup'}" data-auth-route="${signup?'/login':'/signup'}">${signup?'로그인':'회원가입'}</a></p></section></main>`;
}
