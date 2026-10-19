import {withSpanishLocales} from './spanish';
import type {InterfaceLocale} from './interface';

export const authRoutes={
  br:{signin:'/br/entrar',account:'/br/conta'},
  mx:{signin:'/mx/iniciar-sesion',account:'/mx/cuenta'},
  co:{signin:'/co/iniciar-sesion',account:'/co/cuenta'},
  pe:{signin:'/pe/iniciar-sesion',account:'/pe/cuenta'},
  en:{signin:'/en/sign-in',account:'/en/account'},
} as const;

export type AuthRouteKey=keyof typeof authRoutes.br;

export const authCopy=withSpanishLocales({
  br:{
    signInTitle:'Entrar',signInLead:'Acompanhe o futebol com uma conta LivaSports. Guias e ferramentas de futebol são acessíveis sem entrar.',
    google:'Continuar com o Google',email:'Continuar com e-mail',emailLabel:'E-mail',emailPlaceholder:'voce@email.com',
    sendLink:'Enviar link de acesso',checkInbox:'Se este endereço puder receber mensagens, enviamos um link de acesso. Ele expira em breve e só pode ser usado uma vez.',
    unavailable:'O acesso à conta está temporariamente indisponível.',accountTitle:'Conta',signOut:'Sair',
    signedInAs:'Conectado como',methods:'Formas de acesso',displayName:'Nome de exibição',saveName:'Salvar nome',
    noName:'Sem nome de exibição',session:'Sessão neste navegador',headerSignIn:'Entrar',headerAccount:'Conta',
    googleMethod:'Google',emailMethod:'E-mail',reserved:'Seus registros salvos foram preservados. Pranchetas e preferências de tema ficam neste navegador.',
    nameSaved:'Nome atualizado.',nameInvalid:'Informe um nome com até 80 caracteres.',
    linkInvalid:'Este link expirou ou já foi usado. Solicite um novo link de acesso.',
    signInFailed:'Não foi possível entrar. Tente novamente usando a forma de acesso da sua conta.',
  },
  mx:{
    signInTitle:'Iniciar sesión',signInLead:'Sigue el fútbol con una cuenta LivaSports. Las guías y herramientas de fútbol están disponibles sin iniciar sesión.',
    google:'Continuar con Google',email:'Continuar con correo',emailLabel:'Correo',emailPlaceholder:'tu@email.com',
    sendLink:'Enviar enlace de acceso',checkInbox:'Si esta dirección puede recibir mensajes, enviamos un enlace de acceso. Caduca pronto y solo se puede usar una vez.',
    unavailable:'El acceso a la cuenta no está disponible temporalmente.',accountTitle:'Cuenta',signOut:'Cerrar sesión',
    signedInAs:'Conectado como',methods:'Formas de acceso',displayName:'Nombre visible',saveName:'Guardar nombre',
    noName:'Sin nombre visible',session:'Sesión en este navegador',headerSignIn:'Entrar',headerAccount:'Cuenta',
    googleMethod:'Google',emailMethod:'Correo',reserved:'Tus registros guardados se conservan. Las pizarras y preferencias de tema se guardan en este navegador.',
    nameSaved:'Nombre actualizado.',nameInvalid:'Indica un nombre de hasta 80 caracteres.',
    linkInvalid:'Este enlace caducó o ya se utilizó. Solicita un nuevo enlace de acceso.',
    signInFailed:'No se pudo iniciar sesión. Intenta de nuevo con el método de acceso de tu cuenta.',
  },
  en:{
    signInTitle:'Sign in',signInLead:'Follow football with a LivaSports account. Football guides and browser tools are available without signing in.',
    google:'Continue with Google',email:'Continue with email',emailLabel:'Email',emailPlaceholder:'you@email.com',
    sendLink:'Send sign-in link',checkInbox:'If this address can receive mail, we sent a sign-in link. It expires soon and can be used once.',
    unavailable:'Account access is temporarily unavailable.',accountTitle:'Account',signOut:'Sign out',
    signedInAs:'Signed in as',methods:'Sign-in methods',displayName:'Display name',saveName:'Save name',
    noName:'No display name',session:'Session on this browser',headerSignIn:'Sign in',headerAccount:'Account',
    googleMethod:'Google',emailMethod:'Email',reserved:'Your saved records are preserved. Football boards and theme preferences are stored in this browser.',
    nameSaved:'Name updated.',nameInvalid:'Enter a name of up to 80 characters.',
    linkInvalid:'This link expired or has already been used. Request a new sign-in link.',
    signInFailed:'Sign-in could not be completed. Try again using your account’s sign-in method.',
  },
});

export function authPath(locale:InterfaceLocale,key:AuthRouteKey):string {
  return authRoutes[locale][key];
}
