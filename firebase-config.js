// Nastavitve skupne baze (Firebase). Dokler je apiKey prazen, so tekme shranjene samo v napravi.
// 1. https://console.firebase.google.com → Add project → v projektu dodaj spletno aplikacijo (</>)
//    in sem prepiši vrednosti iz »firebaseConfig«.
// 2. Build → Authentication → Sign-in method → Google: Enable.
//    Authentication → Settings → Authorized domains: dodaj isvrljuga.github.io.
// 3. Build → Firestore Database → Create database, nato v zavihek »Rules« prilepi vsebino firestore.rules.
// 4. Po prvi prijavi v aplikaciji (zavihek Izvoz) prepiši svoj ID v adminUids tukaj in v firestore.rules.
// Ključ apiKey ni skrivnost; dostop varujejo pravila v firestore.rules.
window.CELJE_CLOUD=window.CELJE_CLOUD||{
  firebase:{apiKey:'',authDomain:'',projectId:'',storageBucket:'',messagingSenderId:'',appId:''},
  adminUids:[]
};
