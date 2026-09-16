import type {SlipUiLocale} from '@/slip/localization';
import type {InterfaceLocale} from './interface';

export const authRoutes={
  br:{signin:'/br/entrar',account:'/br/conta'},
  mx:{signin:'/mx/iniciar-sesion',account:'/mx/cuenta'},
  en:{signin:'/en/sign-in',account:'/en/account'},
} as const;

export type AuthRouteKey=keyof typeof authRoutes.br;

export const authCopy={
  br:{
    signInTitle:'Entrar',signInLead:'Acompanhe o futebol com uma conta LivaSports. Não é preciso entrar para ver partidas, odds ou o bilhete de visitante.',
    google:'Continuar com o Google',email:'Continuar com e-mail',emailLabel:'E-mail',emailPlaceholder:'voce@email.com',
    sendLink:'Enviar link de acesso',checkInbox:'Se este endereço puder receber mensagens, enviamos um link de acesso. Ele expira em breve e só pode ser usado uma vez.',
    unavailable:'O acesso à conta está temporariamente indisponível.',accountTitle:'Conta',signOut:'Sair',
    signedInAs:'Conectado como',methods:'Formas de acesso',displayName:'Nome de exibição',saveName:'Salvar nome',
    noName:'Sem nome de exibição',session:'Sessão neste navegador',headerSignIn:'Entrar',headerAccount:'Conta',
    googleMethod:'Google',emailMethod:'E-mail',reserved:'Favoritos e avisos chegam em uma próxima etapa.',
    nameSaved:'Nome atualizado.',nameInvalid:'Informe um nome com até 80 caracteres.',
  },
  mx:{
    signInTitle:'Iniciar sesión',signInLead:'Sigue el fútbol con una cuenta LivaSports. No necesitas entrar para ver partidos, cuotas o el cupón de visitante.',
    google:'Continuar con Google',email:'Continuar con correo',emailLabel:'Correo',emailPlaceholder:'tu@email.com',
    sendLink:'Enviar enlace de acceso',checkInbox:'Si esta dirección puede recibir mensajes, enviamos un enlace de acceso. Caduca pronto y solo se puede usar una vez.',
    unavailable:'El acceso a la cuenta no está disponible temporalmente.',accountTitle:'Cuenta',signOut:'Cerrar sesión',
    signedInAs:'Conectado como',methods:'Formas de acceso',displayName:'Nombre visible',saveName:'Guardar nombre',
    noName:'Sin nombre visible',session:'Sesión en este navegador',headerSignIn:'Entrar',headerAccount:'Cuenta',
    googleMethod:'Google',emailMethod:'Correo',reserved:'Favoritos y avisos llegarán en una próxima etapa.',
    nameSaved:'Nombre actualizado.',nameInvalid:'Indica un nombre de hasta 80 caracteres.',
  },
  en:{
    signInTitle:'Sign in',signInLead:'Follow football with a LivaSports account. You do not need to sign in to browse matches, odds or the guest slip.',
    google:'Continue with Google',email:'Continue with email',emailLabel:'Email',emailPlaceholder:'you@email.com',
    sendLink:'Send sign-in link',checkInbox:'If this address can receive mail, we sent a sign-in link. It expires soon and can be used once.',
    unavailable:'Account access is temporarily unavailable.',accountTitle:'Account',signOut:'Sign out',
    signedInAs:'Signed in as',methods:'Sign-in methods',displayName:'Display name',saveName:'Save name',
    noName:'No display name',session:'Session on this browser',headerSignIn:'Sign in',headerAccount:'Account',
    googleMethod:'Google',emailMethod:'Email',reserved:'Favorites and alerts come in a later step.',
    nameSaved:'Name updated.',nameInvalid:'Enter a name of up to 80 characters.',
  },
} satisfies Record<SlipUiLocale,{[key:string]:string}>;

export function authPath(locale:InterfaceLocale,key:AuthRouteKey):string {
  return authRoutes[locale][key];
}
