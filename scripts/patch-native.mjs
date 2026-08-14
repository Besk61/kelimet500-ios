import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

try {
  if (existsSync('.env.local') && typeof process.loadEnvFile === 'function') process.loadEnvFile('.env.local');
} catch (error) {
  console.warn('Could not load .env.local for native IDs:', error);
}

const requested = process.argv[2] || 'all';
const platforms = requested === 'all' ? ['android', 'ios'] : [requested];
const ANDROID_SAMPLE_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const IOS_SAMPLE_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

function saveIfChanged(path, before, after) {
  if (before !== after) {
    writeFileSync(path, after);
    console.log(`patched ${path}`);
  } else {
    console.log(`ok      ${path}`);
  }
}

function patchAndroid() {
  const manifestPath = 'android/app/src/main/AndroidManifest.xml';
  const stringsPath = 'android/app/src/main/res/values/strings.xml';
  const gradlePath = 'android/app/build.gradle';
  const activityPath = 'android/app/src/main/java/com/beskentertainment/kelimet500/MainActivity.java';
  if (!existsSync(manifestPath)) {
    console.warn('android platform not found; skipping Android patches.');
    return;
  }

  const appId = process.env.ADMOB_ANDROID_APP_ID || ANDROID_SAMPLE_APP_ID;

  let strings = readFileSync(stringsPath, 'utf8');
  const admobString = `    <string name="admob_app_id">${appId}</string>`;
  const deepLinkSchemeString = `    <string name="custom_url_scheme">kelimet500</string>`;
  if (/<string name="admob_app_id">.*?<\/string>/.test(strings)) {
    strings = strings.replace(/\s*<string name="admob_app_id">.*?<\/string>/, `\n${admobString}`);
  } else {
    strings = strings.replace(/\s*<\/resources>/, `\n${admobString}\n</resources>`);
  }
  if (/<string name="custom_url_scheme">.*?<\/string>/.test(strings)) {
    strings = strings.replace(/\s*<string name="custom_url_scheme">.*?<\/string>/, `\n${deepLinkSchemeString}`);
  } else {
    strings = strings.replace(/\s*<\/resources>/, `\n${deepLinkSchemeString}\n</resources>`);
  }
  saveIfChanged(stringsPath, readFileSync(stringsPath, 'utf8'), strings);

  let manifest = readFileSync(manifestPath, 'utf8');
  const metadata = `        <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="@string/admob_app_id" />`;
  if (/android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"/.test(manifest)) {
    manifest = manifest.replace(/\s*<meta-data\s+android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"[^>]*\/>/, `\n${metadata}`);
  } else {
    manifest = manifest.replace(/(<application\b[^>]*>)/, `$1\n${metadata}`);
  }
  const appLinksFilter = `
            <!-- KELIMET500_APP_LINKS -->
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="kelimet500.boraeskicioglu.com" android:pathPrefix="/challenge/" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="@string/custom_url_scheme" android:host="challenge" />
            </intent-filter>`;
  if (!manifest.includes('KELIMET500_APP_LINKS')) {
    const mainActivity = /(<activity\b[\s\S]*?<intent-filter>[\s\S]*?android.intent.action.MAIN[\s\S]*?<\/intent-filter>)([\s\S]*?<\/activity>)/;
    if (mainActivity.test(manifest)) {
      manifest = manifest.replace(mainActivity, `$1${appLinksFilter}$2`);
    } else {
      console.warn('Could not find MainActivity block for Android App Links patch.');
    }
  }
  saveIfChanged(manifestPath, readFileSync(manifestPath, 'utf8'), manifest);


  // @capacitor-community/safe-area recommends explicit EdgeToEdge.enable()
  // for Capacitor 8. This also makes status/navigation-bar behavior consistent
  // across Android versions while the web layer respects safe-area insets.
  if (existsSync(activityPath)) {
    const activityOriginal = readFileSync(activityPath, 'utf8');
    let activity = activityOriginal;
    if (!activity.includes('androidx.activity.EdgeToEdge')) {
      activity = activity.replace(
        'import com.getcapacitor.BridgeActivity;',
        'import android.os.Bundle;\nimport androidx.activity.EdgeToEdge;\nimport com.getcapacitor.BridgeActivity;',
      );
    }
    if (!activity.includes('EdgeToEdge.enable(this)')) {
      activity = activity.replace(
        /public class MainActivity extends BridgeActivity\s*\{[\s\S]*?\}/,
        `public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        super.onCreate(savedInstanceState);\n        EdgeToEdge.enable(this);\n    }\n}`,
      );
    }
    saveIfChanged(activityPath, activityOriginal, activity);
  }

  if (existsSync(gradlePath)) {
    let gradle = readFileSync(gradlePath, 'utf8');
    const original = gradle;

    if (!gradle.includes('KELIMET500_CODEMAGIC_SIGNING')) {
      gradle = `// KELIMET500_CODEMAGIC_SIGNING\n` + gradle;
      gradle = gradle.replace(/versionCode\s+\d+/, `versionCode project.hasProperty('versionCode') ? project.property('versionCode').toInteger() : 1`);
      gradle = gradle.replace(/versionName\s+['"][^'"]+['"]/, `versionName project.hasProperty('versionName') ? project.property('versionName') : "1.0.0"`);

      const signingBlock = `\n    signingConfigs {\n        release {\n            if (System.getenv("CM_KEYSTORE_PATH")) {\n                storeFile file(System.getenv("CM_KEYSTORE_PATH"))\n                storePassword System.getenv("CM_KEYSTORE_PASSWORD")\n                keyAlias System.getenv("CM_KEY_ALIAS")\n                keyPassword System.getenv("CM_KEY_PASSWORD")\n            }\n        }\n    }\n`;
      gradle = gradle.replace(/\n\s*buildTypes\s*\{/, `${signingBlock}\n    buildTypes {`);
      gradle = gradle.replace(/(buildTypes\s*\{\s*release\s*\{)/, `$1\n            if (System.getenv("CM_KEYSTORE_PATH")) { signingConfig signingConfigs.release }`);
    }
    saveIfChanged(gradlePath, original, gradle);
  }
}

function ensurePlistKey(plist, key, valueXml) {
  const keyPattern = new RegExp(`\\s*<key>${key}<\\/key>\\s*(?:<string>.*?<\\/string>|<true\\/>|<false\\/>|<array>[\\s\\S]*?<\\/array>)`);
  const entry = `\n\t<key>${key}</key>\n\t${valueXml}`;
  if (keyPattern.test(plist)) return plist.replace(keyPattern, entry);
  return plist.replace(/\s*<\/dict>\s*<\/plist>/, `${entry}\n</dict>\n</plist>`);
}

function patchIos() {
  const plistPath = 'ios/App/App/Info.plist';
  if (!existsSync(plistPath)) {
    console.warn('ios platform not found; skipping iOS patches.');
    return;
  }
  const appId = process.env.ADMOB_IOS_APP_ID || IOS_SAMPLE_APP_ID;
  const original = readFileSync(plistPath, 'utf8');
  let plist = original;
  plist = ensurePlistKey(plist, 'GADApplicationIdentifier', `<string>${appId}</string>`);
  plist = ensurePlistKey(plist, 'GADIsAdManagerApp', '<true/>');
  plist = ensurePlistKey(plist, 'NSUserTrackingUsageDescription', '<string>Bu tanımlayıcı, izin verdiğinizde size daha alakalı reklamlar göstermek için kullanılabilir.</string>');
  plist = ensurePlistKey(plist, 'SKAdNetworkItems', `<array>\n\t\t<dict>\n\t\t\t<key>SKAdNetworkIdentifier</key>\n\t\t\t<string>cstr6suwn9.skadnetwork</string>\n\t\t</dict>\n\t</array>`);
  if (!plist.includes('<key>CFBundleURLTypes</key>')) {
    plist = ensurePlistKey(plist, 'CFBundleURLTypes', `<array>\n\t\t<dict>\n\t\t\t<key>CFBundleURLName</key>\n\t\t\t<string>com.beskentertainment.kelimet500</string>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>kelimet500</string>\n\t\t\t</array>\n\t\t</dict>\n\t</array>`);
  }
  saveIfChanged(plistPath, original, plist);

  // Universal Links entitlement. The matching AASA file is generated for the website
  // by scripts/generate-link-associations.mjs after APPLE_TEAM_ID is configured.
  const entitlementsPath = 'ios/App/App/App.entitlements';
  const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.developer.associated-domains</key>
	<array>
		<string>applinks:kelimet500.boraeskicioglu.com</string>
	</array>
</dict>
</plist>
`;
  writeFileSync(entitlementsPath, entitlements);
  console.log(`patched ${entitlementsPath}`);

  const projectPath = 'ios/App/App.xcodeproj/project.pbxproj';
  if (existsSync(projectPath)) {
    const projectOriginal = readFileSync(projectPath, 'utf8');
    let project = projectOriginal;
    if (!project.includes('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;')) {
      project = project.replace(
        /(PRODUCT_BUNDLE_IDENTIFIER = com\.beskentertainment\.kelimet500;)/g,
        `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n\t\t\t\t$1`,
      );
    }
    saveIfChanged(projectPath, projectOriginal, project);
  }
}

for (const platform of platforms) {
  if (platform === 'android') patchAndroid();
  if (platform === 'ios') patchIos();
}
