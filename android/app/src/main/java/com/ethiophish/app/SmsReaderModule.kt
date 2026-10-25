package com.ethiophish.app

import android.database.Cursor
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class SmsReaderModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "SmsReaderModule"

    @ReactMethod
    fun queryInbox(minTimestamp: Double, promise: Promise) {
        try {
            val uri: Uri = Uri.parse("content://sms/inbox")
            val projection = arrayOf("address", "body", "date")
            val selection = "date >= ?"
            val selectionArgs = arrayOf(minTimestamp.toLong().toString())
            val sortOrder = "date DESC"

            val cursor: Cursor? = reactApplicationContext.contentResolver.query(
                uri, projection, selection, selectionArgs, sortOrder
            )

            val messagesArray = Arguments.createArray()
            cursor?.use {
                val addressIdx = it.getColumnIndex("address")
                val bodyIdx = it.getColumnIndex("body")
                val dateIdx = it.getColumnIndex("date")

                while (it.moveToNext()) {
                    val map = Arguments.createMap()
                    map.putString("sender", if (addressIdx != -1) it.getString(addressIdx) else "Unknown")
                    map.putString("body", if (bodyIdx != -1) it.getString(bodyIdx) else "")
                    map.putDouble("timestamp", if (dateIdx != -1) it.getDouble(dateIdx) else 0.0)
                    messagesArray.pushMap(map)
                }
            }
            promise.resolve(messagesArray)
        } catch (e: Exception) {
            promise.reject("SMS_ERROR", e.message, e)
        }
    }
}
