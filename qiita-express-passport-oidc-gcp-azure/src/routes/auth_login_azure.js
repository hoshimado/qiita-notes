var express = require('express');
var router = express.Router();
var path = require('path');
var createError = require("http-errors");


var passport = require("passport");


/**
 * 下記のOIDC連携ログインの情報は、GCPは以下のコンソールから設定と取得を行う。
 * https://portal.azure.com/
 * 
 * ※「ほしまど」のAzureアカウントで管理していることに留意。
 */
var THIS_ROUTE_PATH = 'auth-azure';
var oidcConfig = {
  CLIENT_ID : process.env.AZURE_CLIENT_ID,
  CLIENT_SECRET : process.env.AZURE_CLIENT_SECRET,
  RESPONSE_TYPE : 'code', // Authentication Flow、を指定
  SCOPE : 'openid profile',
  REDIRECT_URI_DIRECTORY : 'callback' // 「THIS_ROUTE_PATH + この値」が、OIDCプロバイダーへ登録した「コールバック先のURL」になるので注意。
};
// https://docs.microsoft.com/ja-jp/azure/active-directory/develop/quickstart-register-app



// ここで、
// 「OpenidConnectStrategy = require("passport-openidconnect")」を
// Passport.jsのStrategyに設定した場合、Passportとしてのsessino初期化が必須となる。
// 
// OIDCのIdPの違いに依存せずに同一処理となるため、
// app.jsの方で以下を記載している。
// 
// > app.use(passport.initialize());
// > app.use(passport.session());




// OIDCの認可手続きを行うためのミドルウェアとしてのpassportをセットアップ。-------------------------------------------------
var OpenidConnectStrategy = require("passport-openidconnect").Strategy;
var Instance4AzureOIDC = new OpenidConnectStrategy(
    {
      issuer: "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0",
      authorizationURL: "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
      tokenURL:         "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
      userInfoURL:  "https://graph.microsoft.com/oidc/userinfo",
      clientID:     oidcConfig.CLIENT_ID,
      clientSecret: oidcConfig.CLIENT_SECRET,
      callbackURL:  THIS_ROUTE_PATH + '/' + oidcConfig.REDIRECT_URI_DIRECTORY,
      scope: ["openid", "profile"]
      /**
       * 公開情報（EndPointとか）は以下を参照
       * https://docs.microsoft.com/ja-jp/azure/active-directory/develop/quickstart-register-app
       * https://login.microsoftonline.com/consumers/v2.0/.well-known/openid-configuration
       */
    },
    function (
      issuer,
      sub,
      profile,
      jwtClaims,
      accessToken,
      refreshToken,
      tokenResponse,
      done
    ) {
      // [For Debug]
      // 認証成功したらこの関数が実行される
      // ここでID tokenの検証を行う
      console.log("===[Success Authenticate by Azure OIDC]===");
      console.log("issuer: ", issuer);
      console.log("sub: ", sub);
      console.log("profile: ", profile);
      console.log("jwtClaims: ", jwtClaims);
      console.log("accessToken: ", accessToken);
      console.log("refreshToken: ", refreshToken);
      console.log("tokenResponse: ", tokenResponse);

      return done(null, {
        title : 'OIDC by Azure',
        profile: profile,
        accessToken: {
          token: accessToken,
          scope: tokenResponse.scope,
          token_type: tokenResponse.token_type,
          expires_in: tokenResponse.expires_in,
        },
        idToken: {
          token: tokenResponse.id_token,
          claims: jwtClaims,
        },
      });
    }
);

/**
 * Strategies used for authorization are the same as those used for authentication. 
 * However, an application may want to offer both authentication and 
 * authorization with the same third-party service. 
 * In this case, a named strategy can be used, 
 * by overriding the strategy's default name in the call to use().
 * 
 * https://www.passportjs.org/docs/configure/
 * の、大分下の方に、上述の「a named strategy can be used」の記載がある。
*/
passport.use('openidconnect-azure', Instance4AzureOIDC);



// ログイン要求を受けて、OIDCの認可プロバイダーへリダイレクト。-------------------------------------------------
router.get(
  '/login', 
  passport.authenticate("openidconnect-azure")
);




// OIDCの認可プロバイダーからのリダイレクトを受ける。---------------------------------------------------------
// ※この時、passport.authenticate() は、渡されてくるクエリーによって動作を変更する仕様。
router.get(
  '/' + oidcConfig.REDIRECT_URI_DIRECTORY,
  passport.authenticate("openidconnect-azure", {
    failureRedirect: "loginfail",
  }),
  function (req, res) {
    // Successful authentication, redirect home.
    console.log("認可コード:" + req.query.code);
    req.session.user = req.session.passport.user.displayName;
    console.log(req.session);
    res.redirect("loginsuccess");
  }
);





// THIS_ROUTE_PATH (='../auth') 配下のファイルへのアクセス要求の、上記（login/callback）以外の処理を記載する。---------------

// ログインに失敗したときに表示されるページ
router.get('loginfail', function (req, res, next) {
  var htmlStr = '<html lang="ja">';
  htmlStr += '<head>';
  htmlStr += '<meta charset="UTF-8">';
  htmlStr += '<title>login success.</title>';
  htmlStr += '</head>'
  htmlStr += '<body>';
  htmlStr += 'ログインに失敗しました。';
  htmlStr += '</body>';
  htmlStr += '</html>';

  res.header({"Content-Type" : "text/html; charset=utf-8"})
  res.status(200).send(htmlStr);
  res.end();
});


// ログインに成功したときに表示されるページ
router.get('/loginsuccess', function(req, res, next) {
  console.log("----"+THIS_ROUTE_PATH+"login----");
  console.log(req.session.passport);
  var htmlStr = '<html lang="ja">';
  htmlStr += '<head>';
  htmlStr += '<meta charset="UTF-8">';
  htmlStr += '<title>login success.</title>';
  htmlStr += '</head>'
  htmlStr += '<body>';
  htmlStr += 'ログインに成功しました。as ' + req.session.passport.user.profile.displayName;
  htmlStr += '</body>';
  htmlStr += '</html>';

  res.header({"Content-Type" : "text/html; charset=utf-8"})
  res.status(200).send(htmlStr);
  res.end();
});

/*
{ user:
   { profile:
      { id: 'IDトークンに含まれるIDと同一',
        displayName: 'IDトークンに紐づいているユーザー名',
        name: [Object],
        _raw: [Object],
     accessToken:
      { OIDCのトークンエンドポイントから払い出された、OAuth2.0のアクセストークン },
     idToken:
      { IDトークン（JWT） }
      }
   }
}
*/


// 「get()」ではなく「use()」であることに注意。
// ref. https://stackoverflow.com/questions/15601703/difference-between-app-use-and-app-get-in-express-js
router.use('/', function(req, res, next) {
    console.log('任意の'+THIS_ROUTE_PATH+'配下へのアクセス');
    console.log("+++ req.session.passport +++");
    console.log(req.session);
    console.log('[req.session.passport.user.profile]')
    console.log(req.session.passport.user.profile);
    console.log("----------------------------");

    if(req.session && req.session.passport && req.session.passport.user && req.session.passport.user.profile){
      console.log('OIDCでログインしたセッションを取得できた')
      console.log(path.join(__dirname, '../' + THIS_ROUTE_PATH));
      next();
    }else{
      console.log('ログインしてない＝セッション取れない')
      next(createError(401, 'Please login to view this page.'));
    }
  }, express.static(path.join(__dirname, '../' + THIS_ROUTE_PATH)) );
  



// catch 404 and forward to error handler +++add
router.use(function (req, res, next) {
  next(createError(404));
});



module.exports = router;




