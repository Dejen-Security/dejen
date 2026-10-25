package com.DejenSecurity.app

import android.content.ContentValues
import android.os.Build
import android.provider.BlockedNumberContract
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SmsBlockerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "SmsBlockerModule"
    }

    @ReactMethod
    fun blockNumber(phoneNumber: String, promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                val values = ContentValues().apply {
                    put(BlockedNumberContract.BlockedNumbers.COLUMN_ORIGINAL_NUMBER, phoneNumber)
                }
                val uri = reactApplicationContext.contentResolver.insert(BlockedNumberContract.BlockedNumbers.CONTENT_URI, values)
                if (uri != null) {
                    promise.resolve(true)
                } else {
                    promise.resolve(false)
                }
            } catch (e: Exception) {
                promise.reject("BLOCK_ERROR", e.message)
            }
        } else {
            promise.reject("VERSION_ERROR", "Blocking numbers requires Android 7.0 or higher.")
        }
    }
}
