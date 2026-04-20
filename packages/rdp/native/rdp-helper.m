#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import <ImageIO/ImageIO.h>

#include <freerdp/freerdp.h>
#include <freerdp/gdi/gdi.h>
#include <freerdp/input.h>
#include <freerdp/scancode.h>
#include <freerdp/settings.h>
#include <freerdp/settings_keys.h>

#include <pthread.h>
#include <unistd.h>
#include <winpr/wlog.h>
#include <winpr/synch.h>

typedef struct
{
	rdpContext context;
} MidsceneRdpContext;

typedef struct
{
	freerdp* instance;
	pthread_t eventThread;
	pthread_mutex_t sessionMutex;
	BOOL mutexInitialized;
	BOOL eventThreadStarted;
	BOOL running;
	BOOL connected;
	BOOL gdiInitialized;
	UINT16 mouseX;
	UINT16 mouseY;
	char* sessionId;
	char* lastSessionErrorMessage;
	char* lastSessionErrorCode;
} MidsceneHelperState;

static MidsceneHelperState gState = { 0 };

static NSString* MidsceneStringFromCString(const char* value)
{
	if (!value)
		return nil;
	return [NSString stringWithUTF8String:value];
}

static NSString* MidsceneTrimmedString(NSString* value)
{
	if (!value)
		return nil;
	return [value stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
}

static void MidsceneReplaceCString(char** target, NSString* value)
{
	if (!target)
		return;

	if (*target)
	{
		free(*target);
		*target = NULL;
	}

	if (value.length > 0)
		*target = strdup(value.UTF8String);
}

static void MidsceneClearSessionError(void)
{
	MidsceneReplaceCString(&gState.lastSessionErrorMessage, nil);
	MidsceneReplaceCString(&gState.lastSessionErrorCode, nil);
}

static void MidsceneSetSessionError(NSString* message, NSString* code)
{
	MidsceneReplaceCString(&gState.lastSessionErrorMessage,
	                       message.length > 0 ? message : @"RDP session was lost");
	MidsceneReplaceCString(&gState.lastSessionErrorCode,
	                       code.length > 0 ? code : @"session_lost");
}

static NSDictionary* MidsceneSizePayload(INT32 width, INT32 height)
{
	return @{
		@"width" : @(width),
		@"height" : @(height),
	};
}

static void MidsceneWriteJsonLine(NSDictionary* value)
{
	NSError* error = nil;
	NSData* data = [NSJSONSerialization dataWithJSONObject:value options:0 error:&error];
	if (!data)
	{
		fprintf(stderr, "Failed to serialize helper response: %s\n",
		        error.localizedDescription.UTF8String);
		fflush(stderr);
		return;
	}

	fwrite(data.bytes, 1, data.length, stdout);
	fputc('\n', stdout);
	fflush(stdout);
}

static void MidsceneSendPayload(NSString* requestId, NSDictionary* payload)
{
	MidsceneWriteJsonLine(@{
		@"id" : requestId ?: @"",
		@"ok" : @YES,
		@"payload" : payload,
	});
}

static void MidsceneSendOk(NSString* requestId)
{
	MidsceneSendPayload(requestId, @{ @"type" : @"ok" });
}

static void MidsceneSendError(NSString* requestId, NSString* message, NSString* code)
{
	NSMutableDictionary* errorPayload = [@{
		@"message" : message ?: @"Unknown RDP helper error",
	} mutableCopy];

	if (code.length > 0)
		errorPayload[@"code"] = code;

	MidsceneWriteJsonLine(@{
		@"id" : requestId ?: @"",
		@"ok" : @NO,
		@"error" : errorPayload,
	});
}

static NSString* MidsceneLastFreeRdpError(void)
{
	if (!gState.instance || !gState.instance->context)
		return @"FreeRDP session is not initialized";

	const UINT32 lastError = freerdp_get_last_error(gState.instance->context);
	const char* errorName = freerdp_get_last_error_name(lastError);
	const char* errorMessage = freerdp_get_last_error_string(lastError);

	NSMutableArray<NSString*>* parts = [NSMutableArray array];
	if (errorName)
		[parts addObject:MidsceneStringFromCString(errorName)];
	if (errorMessage)
		[parts addObject:MidsceneStringFromCString(errorMessage)];

	if (parts.count > 0)
		return [parts componentsJoinedByString:@": "];

	return [NSString stringWithFormat:@"FreeRDP error code %u", lastError];
}

static BOOL MidsceneContextNew(freerdp* instance, rdpContext* context)
{
	(void)instance;
	(void)context;
	return TRUE;
}

static void MidsceneContextFree(freerdp* instance, rdpContext* context)
{
	(void)instance;
	(void)context;
}

static BOOL MidscenePreConnect(freerdp* instance)
{
	(void)instance;
	return TRUE;
}

static BOOL MidscenePostConnect(freerdp* instance)
{
	if (!gdi_init(instance, PIXEL_FORMAT_BGRA32))
		return FALSE;

	gState.gdiInitialized = TRUE;
	rdpInput* input = instance->context->input;
	if (input)
	{
		freerdp_input_send_synchronize_event(input, 0);
		freerdp_input_send_focus_in_event(input, 0);
	}

	return TRUE;
}

static DWORD MidsceneVerifyCertificateEx(freerdp* instance, const char* host, UINT16 port,
                                         const char* common_name, const char* subject,
                                         const char* issuer, const char* fingerprint, DWORD flags)
{
	(void)instance;
	(void)host;
	(void)port;
	(void)common_name;
	(void)subject;
	(void)issuer;
	(void)fingerprint;
	(void)flags;
	return 2;
}

static DWORD MidsceneVerifyChangedCertificateEx(freerdp* instance, const char* host,
                                                UINT16 port, const char* common_name,
                                                const char* subject, const char* issuer,
                                                const char* new_fingerprint,
                                                const char* old_subject,
                                                const char* old_issuer,
                                                const char* old_fingerprint, DWORD flags)
{
	(void)instance;
	(void)host;
	(void)port;
	(void)common_name;
	(void)subject;
	(void)issuer;
	(void)new_fingerprint;
	(void)old_subject;
	(void)old_issuer;
	(void)old_fingerprint;
	(void)flags;
	return 2;
}

static NSDictionary* MidsceneCurrentSizeLocked(void)
{
	if (!gState.instance || !gState.instance->context || !gState.instance->context->gdi)
		return nil;

	rdpGdi* gdi = gState.instance->context->gdi;
	return MidsceneSizePayload(gdi->width, gdi->height);
}

static BOOL MidsceneKeyDownLocked(UINT32 scancode)
{
	return freerdp_input_send_keyboard_event_ex(gState.instance->context->input, TRUE, FALSE,
	                                            scancode);
}

static BOOL MidsceneKeyUpLocked(UINT32 scancode)
{
	return freerdp_input_send_keyboard_event_ex(gState.instance->context->input, FALSE, FALSE,
	                                            scancode);
}

static BOOL MidsceneTapScancodeLocked(UINT32 scancode)
{
	return MidsceneKeyDownLocked(scancode) && MidsceneKeyUpLocked(scancode);
}

static BOOL MidsceneUnicodeCharLocked(unichar value)
{
	if (value == '\r' || value == '\n')
		return MidsceneTapScancodeLocked(RDP_SCANCODE_RETURN);

	return freerdp_input_send_unicode_keyboard_event(gState.instance->context->input, 0, value) &&
	       freerdp_input_send_unicode_keyboard_event(gState.instance->context->input,
	                                                KBD_FLAGS_RELEASE, value);
}

static BOOL MidsceneMouseMoveLocked(UINT16 x, UINT16 y)
{
	if (!freerdp_input_send_mouse_event(gState.instance->context->input, PTR_FLAGS_MOVE, x, y))
		return FALSE;

	gState.mouseX = x;
	gState.mouseY = y;
	return TRUE;
}

static UINT16 MidsceneMouseButtonFlag(NSString* button)
{
	if ([button isEqualToString:@"left"])
		return PTR_FLAGS_BUTTON1;
	if ([button isEqualToString:@"right"])
		return PTR_FLAGS_BUTTON2;
	if ([button isEqualToString:@"middle"])
		return PTR_FLAGS_BUTTON3;
	return 0;
}

static BOOL MidsceneMouseButtonOnceLocked(UINT16 flags, BOOL down)
{
	const UINT16 pointerFlags = down ? (flags | PTR_FLAGS_DOWN) : flags;
	return freerdp_input_send_mouse_event(gState.instance->context->input, pointerFlags,
	                                      gState.mouseX, gState.mouseY);
}

static BOOL MidsceneMouseButtonActionLocked(NSString* button, NSString* action)
{
	const UINT16 buttonFlags = MidsceneMouseButtonFlag(button);
	if (buttonFlags == 0)
		return FALSE;

	if ([action isEqualToString:@"down"])
		return MidsceneMouseButtonOnceLocked(buttonFlags, TRUE);
	if ([action isEqualToString:@"up"])
		return MidsceneMouseButtonOnceLocked(buttonFlags, FALSE);
	if ([action isEqualToString:@"click"])
		return MidsceneMouseButtonOnceLocked(buttonFlags, TRUE) &&
		       MidsceneMouseButtonOnceLocked(buttonFlags, FALSE);
	if ([action isEqualToString:@"doubleClick"])
		return MidsceneMouseButtonOnceLocked(buttonFlags, TRUE) &&
		       MidsceneMouseButtonOnceLocked(buttonFlags, FALSE) &&
		       MidsceneMouseButtonOnceLocked(buttonFlags, TRUE) &&
		       MidsceneMouseButtonOnceLocked(buttonFlags, FALSE);

	return FALSE;
}

static BOOL MidsceneWheelLocked(NSString* direction, NSInteger amount, NSNumber* xValue,
                                NSNumber* yValue)
{
	if (xValue && yValue)
	{
		if (!MidsceneMouseMoveLocked((UINT16)xValue.unsignedIntValue, (UINT16)yValue.unsignedIntValue))
			return FALSE;
	}

	UINT16 baseFlags = 0;
	BOOL negative = NO;
	if ([direction isEqualToString:@"up"])
	{
		baseFlags = PTR_FLAGS_WHEEL;
	}
	else if ([direction isEqualToString:@"down"])
	{
		baseFlags = PTR_FLAGS_WHEEL;
		negative = YES;
	}
	else if ([direction isEqualToString:@"left"])
	{
		baseFlags = PTR_FLAGS_HWHEEL;
	}
	else if ([direction isEqualToString:@"right"])
	{
		baseFlags = PTR_FLAGS_HWHEEL;
		negative = YES;
	}
	else
	{
		return FALSE;
	}

	NSInteger remaining = llabs(amount);
	if (remaining == 0)
		remaining = 120;

	while (remaining > 0)
	{
		const UINT16 chunk = (UINT16)MIN(remaining, 120);
		UINT16 flags = baseFlags | (chunk & WheelRotationMask);
		if (negative)
			flags |= PTR_FLAGS_WHEEL_NEGATIVE;

		if (!freerdp_input_send_mouse_event(gState.instance->context->input, flags, gState.mouseX,
		                                    gState.mouseY))
			return FALSE;
		remaining -= chunk;
	}

	return TRUE;
}

static BOOL MidsceneLookupScancode(NSString* keyName, UINT32* scancode)
{
	if (!keyName || !scancode)
		return FALSE;

	NSString* lowered = keyName.lowercaseString;
	if (lowered.length == 1)
	{
		unichar ch = [lowered characterAtIndex:0];
		switch (ch)
		{
			case 'a':
				*scancode = RDP_SCANCODE_KEY_A;
				return TRUE;
			case 'b':
				*scancode = RDP_SCANCODE_KEY_B;
				return TRUE;
			case 'c':
				*scancode = RDP_SCANCODE_KEY_C;
				return TRUE;
			case 'd':
				*scancode = RDP_SCANCODE_KEY_D;
				return TRUE;
			case 'e':
				*scancode = RDP_SCANCODE_KEY_E;
				return TRUE;
			case 'f':
				*scancode = RDP_SCANCODE_KEY_F;
				return TRUE;
			case 'g':
				*scancode = RDP_SCANCODE_KEY_G;
				return TRUE;
			case 'h':
				*scancode = RDP_SCANCODE_KEY_H;
				return TRUE;
			case 'i':
				*scancode = RDP_SCANCODE_KEY_I;
				return TRUE;
			case 'j':
				*scancode = RDP_SCANCODE_KEY_J;
				return TRUE;
			case 'k':
				*scancode = RDP_SCANCODE_KEY_K;
				return TRUE;
			case 'l':
				*scancode = RDP_SCANCODE_KEY_L;
				return TRUE;
			case 'm':
				*scancode = RDP_SCANCODE_KEY_M;
				return TRUE;
			case 'n':
				*scancode = RDP_SCANCODE_KEY_N;
				return TRUE;
			case 'o':
				*scancode = RDP_SCANCODE_KEY_O;
				return TRUE;
			case 'p':
				*scancode = RDP_SCANCODE_KEY_P;
				return TRUE;
			case 'q':
				*scancode = RDP_SCANCODE_KEY_Q;
				return TRUE;
			case 'r':
				*scancode = RDP_SCANCODE_KEY_R;
				return TRUE;
			case 's':
				*scancode = RDP_SCANCODE_KEY_S;
				return TRUE;
			case 't':
				*scancode = RDP_SCANCODE_KEY_T;
				return TRUE;
			case 'u':
				*scancode = RDP_SCANCODE_KEY_U;
				return TRUE;
			case 'v':
				*scancode = RDP_SCANCODE_KEY_V;
				return TRUE;
			case 'w':
				*scancode = RDP_SCANCODE_KEY_W;
				return TRUE;
			case 'x':
				*scancode = RDP_SCANCODE_KEY_X;
				return TRUE;
			case 'y':
				*scancode = RDP_SCANCODE_KEY_Y;
				return TRUE;
			case 'z':
				*scancode = RDP_SCANCODE_KEY_Z;
				return TRUE;
			case '0':
				*scancode = RDP_SCANCODE_KEY_0;
				return TRUE;
			case '1':
				*scancode = RDP_SCANCODE_KEY_1;
				return TRUE;
			case '2':
				*scancode = RDP_SCANCODE_KEY_2;
				return TRUE;
			case '3':
				*scancode = RDP_SCANCODE_KEY_3;
				return TRUE;
			case '4':
				*scancode = RDP_SCANCODE_KEY_4;
				return TRUE;
			case '5':
				*scancode = RDP_SCANCODE_KEY_5;
				return TRUE;
			case '6':
				*scancode = RDP_SCANCODE_KEY_6;
				return TRUE;
			case '7':
				*scancode = RDP_SCANCODE_KEY_7;
				return TRUE;
			case '8':
				*scancode = RDP_SCANCODE_KEY_8;
				return TRUE;
			case '9':
				*scancode = RDP_SCANCODE_KEY_9;
				return TRUE;
			default:
				break;
		}
	}

	if ([lowered isEqualToString:@"enter"] || [lowered isEqualToString:@"return"])
		*scancode = RDP_SCANCODE_RETURN;
	else if ([lowered isEqualToString:@"backspace"])
		*scancode = RDP_SCANCODE_BACKSPACE;
	else if ([lowered isEqualToString:@"delete"])
		*scancode = RDP_SCANCODE_DELETE;
	else if ([lowered isEqualToString:@"tab"])
		*scancode = RDP_SCANCODE_TAB;
	else if ([lowered isEqualToString:@"escape"] || [lowered isEqualToString:@"esc"])
		*scancode = RDP_SCANCODE_ESCAPE;
	else if ([lowered isEqualToString:@"space"])
		*scancode = RDP_SCANCODE_SPACE;
	else if ([lowered isEqualToString:@"left"])
		*scancode = RDP_SCANCODE_LEFT;
	else if ([lowered isEqualToString:@"right"])
		*scancode = RDP_SCANCODE_RIGHT;
	else if ([lowered isEqualToString:@"up"])
		*scancode = RDP_SCANCODE_UP;
	else if ([lowered isEqualToString:@"down"])
		*scancode = RDP_SCANCODE_DOWN;
	else if ([lowered isEqualToString:@"home"])
		*scancode = RDP_SCANCODE_HOME;
	else if ([lowered isEqualToString:@"end"])
		*scancode = RDP_SCANCODE_END;
	else if ([lowered isEqualToString:@"pageup"])
		*scancode = RDP_SCANCODE_PRIOR;
	else if ([lowered isEqualToString:@"pagedown"])
		*scancode = RDP_SCANCODE_NEXT;
	else if ([lowered isEqualToString:@"control"] || [lowered isEqualToString:@"ctrl"])
		*scancode = RDP_SCANCODE_LCONTROL;
	else if ([lowered isEqualToString:@"shift"])
		*scancode = RDP_SCANCODE_LSHIFT;
	else if ([lowered isEqualToString:@"alt"] || [lowered isEqualToString:@"option"])
		*scancode = RDP_SCANCODE_LMENU;
	else if ([lowered isEqualToString:@"meta"] || [lowered isEqualToString:@"win"] ||
	         [lowered isEqualToString:@"windows"] || [lowered isEqualToString:@"command"])
		*scancode = RDP_SCANCODE_LWIN;
	else
		return FALSE;

	return TRUE;
}

static BOOL MidsceneKeyPressLocked(NSString* keyName)
{
	NSArray<NSString*>* rawParts = [keyName componentsSeparatedByString:@"+"];
	NSMutableArray<NSString*>* parts = [NSMutableArray array];
	for (NSString* rawPart in rawParts)
	{
		NSString* part = MidsceneTrimmedString(rawPart);
		if (part.length > 0)
			[parts addObject:part];
	}

	if (parts.count == 0)
		return FALSE;

	NSMutableArray<NSNumber*>* modifiers = [NSMutableArray array];
	for (NSUInteger index = 0; index + 1 < parts.count; index++)
	{
		UINT32 modifierScancode = 0;
		if (!MidsceneLookupScancode(parts[index], &modifierScancode))
			return FALSE;
		[modifiers addObject:@(modifierScancode)];
	}

	UINT32 finalScancode = 0;
	if (!MidsceneLookupScancode(parts.lastObject, &finalScancode))
		return FALSE;

	for (NSNumber* modifier in modifiers)
	{
		if (!MidsceneKeyDownLocked(modifier.unsignedIntValue))
			return FALSE;
	}

	BOOL ok = MidsceneTapScancodeLocked(finalScancode);
	for (NSNumber* modifier in modifiers.reverseObjectEnumerator)
	{
		if (!MidsceneKeyUpLocked(modifier.unsignedIntValue))
			ok = FALSE;
	}

	return ok;
}

static BOOL MidsceneClearInputLocked(void)
{
	return MidsceneKeyPressLocked(@"Control+A") && MidsceneTapScancodeLocked(RDP_SCANCODE_BACKSPACE);
}

static NSData* MidsceneCopyFrameLocked(size_t* width, size_t* height, size_t* stride,
                                       NSError** error)
{
	if (!gState.instance || !gState.instance->context || !gState.instance->context->gdi)
	{
		if (error)
		{
			*error = [NSError errorWithDomain:@"midscene.rdp"
			                             code:1
			                         userInfo:@{ NSLocalizedDescriptionKey : @"No remote framebuffer is available" }];
		}
		return nil;
	}

	rdpGdi* gdi = gState.instance->context->gdi;
	if (!gdi->primary_buffer || gdi->width <= 0 || gdi->height <= 0 || gdi->stride == 0)
	{
		if (error)
		{
			*error = [NSError errorWithDomain:@"midscene.rdp"
			                             code:2
			                         userInfo:@{ NSLocalizedDescriptionKey : @"Remote framebuffer is empty" }];
		}
		return nil;
	}

	if (width)
		*width = (size_t)gdi->width;
	if (height)
		*height = (size_t)gdi->height;
	if (stride)
		*stride = (size_t)gdi->stride;

	const size_t pixelBufferSize = (size_t)gdi->stride * (size_t)gdi->height;
	return [NSData dataWithBytes:gdi->primary_buffer length:pixelBufferSize];
}

static NSData* MidscenePngDataFromFrame(NSData* rawFrame, size_t width, size_t height,
                                        size_t stride, NSError** error)
{
	if (!rawFrame || width == 0 || height == 0 || stride == 0)
	{
		if (error)
		{
			*error = [NSError errorWithDomain:@"midscene.rdp"
			                             code:5
			                         userInfo:@{ NSLocalizedDescriptionKey : @"Remote framebuffer snapshot is empty" }];
		}
		return nil;
	}

	CGDataProviderRef provider = CGDataProviderCreateWithCFData((__bridge CFDataRef)rawFrame);
	CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
	const CGBitmapInfo bitmapInfo =
	    (CGBitmapInfo)(kCGImageAlphaPremultipliedFirst | kCGBitmapByteOrder32Little);
	CGImageRef image = CGImageCreate(width, height, 8, 32, stride,
	                                 colorSpace, bitmapInfo, provider, NULL, false,
	                                 kCGRenderingIntentDefault);

	if (!image)
	{
		if (error)
		{
			*error = [NSError errorWithDomain:@"midscene.rdp"
			                             code:3
			                         userInfo:@{ NSLocalizedDescriptionKey : @"Failed to create PNG from framebuffer" }];
		}

		CGColorSpaceRelease(colorSpace);
		CGDataProviderRelease(provider);
		return nil;
	}

	NSMutableData* pngData = [NSMutableData data];
	CGImageDestinationRef destination =
	    CGImageDestinationCreateWithData((__bridge CFMutableDataRef)pngData, CFSTR("public.png"), 1,
	                                     NULL);
	CGImageDestinationAddImage(destination, image, NULL);
	BOOL finalized = CGImageDestinationFinalize(destination);

	CFRelease(destination);
	CGImageRelease(image);
	CGColorSpaceRelease(colorSpace);
	CGDataProviderRelease(provider);

	if (!finalized)
	{
		if (error)
		{
			*error = [NSError errorWithDomain:@"midscene.rdp"
			                             code:4
			                         userInfo:@{ NSLocalizedDescriptionKey : @"Failed to encode PNG screenshot" }];
		}
		return nil;
	}

	return pngData;
}

static void MidsceneResetState(void)
{
	gState.instance = NULL;
	gState.running = FALSE;
	gState.connected = FALSE;
	gState.gdiInitialized = FALSE;
	gState.eventThreadStarted = FALSE;
	gState.mouseX = 0;
	gState.mouseY = 0;

	if (gState.sessionId)
	{
		free(gState.sessionId);
		gState.sessionId = NULL;
	}

	MidsceneClearSessionError();
}

static void MidsceneDisconnectSession(void)
{
	freerdp* instance = gState.instance;
	if (!instance)
	{
		MidsceneResetState();
		return;
	}

	gState.running = FALSE;

	pthread_mutex_lock(&gState.sessionMutex);
	if (gState.connected)
		freerdp_disconnect(instance);
	pthread_mutex_unlock(&gState.sessionMutex);

	if (gState.eventThreadStarted)
	{
		pthread_join(gState.eventThread, NULL);
		gState.eventThreadStarted = FALSE;
	}

	if (gState.gdiInitialized)
	{
		gdi_free(instance);
		gState.gdiInitialized = FALSE;
	}

	freerdp_context_free(instance);
	freerdp_free(instance);
	MidsceneResetState();
}

static void* MidsceneEventThreadMain(void* unused)
{
	(void)unused;
	while (gState.running && gState.connected && gState.instance && gState.instance->context)
	{
		HANDLE handles[32] = { 0 };
		const DWORD count = freerdp_get_event_handles(gState.instance->context, handles,
		                                              ARRAYSIZE(handles));
		if (count == 0)
		{
			MidsceneSetSessionError(@"freerdp_get_event_handles returned no handles",
			                        @"session_lost");
			fprintf(stderr, "RDP session event loop failed: freerdp_get_event_handles returned no handles\n");
			fflush(stderr);
			gState.connected = FALSE;
			gState.running = FALSE;
			break;
		}

		const DWORD status = WaitForMultipleObjects(count, handles, FALSE, 100);
		if (status == WAIT_FAILED)
		{
			MidsceneSetSessionError(@"WaitForMultipleObjects failed in the RDP event loop",
			                        @"session_lost");
			fprintf(stderr, "RDP session event loop failed: WaitForMultipleObjects failed\n");
			fflush(stderr);
			gState.connected = FALSE;
			gState.running = FALSE;
			break;
		}

		pthread_mutex_lock(&gState.sessionMutex);
		const BOOL ok = freerdp_check_event_handles(gState.instance->context);
		const BOOL shouldDisconnect =
		    freerdp_shall_disconnect_context(gState.instance->context);
		NSString* failureReason = (!ok || shouldDisconnect) ? MidsceneLastFreeRdpError() : nil;
		pthread_mutex_unlock(&gState.sessionMutex);

		if (!ok || shouldDisconnect)
		{
			MidsceneSetSessionError(failureReason, @"session_lost");
			gState.connected = FALSE;
			gState.running = FALSE;
			fprintf(stderr, "RDP session event loop failed: %s\n",
			        failureReason.UTF8String);
			fflush(stderr);
			break;
		}
	}

	return NULL;
}

static BOOL MidsceneApplyConnectionConfig(NSDictionary* config, NSString** errorMessage)
{
	NSString* host = config[@"host"];
	if (![host isKindOfClass:[NSString class]] || host.length == 0)
	{
		*errorMessage = @"connect.config.host is required";
		return FALSE;
	}

	const NSNumber* portNumber = [config[@"port"] isKindOfClass:[NSNumber class]]
	                                 ? config[@"port"]
	                                 : @3389;
	NSString* username = [config[@"username"] isKindOfClass:[NSString class]]
	                         ? config[@"username"]
	                         : nil;
	NSString* password = [config[@"password"] isKindOfClass:[NSString class]]
	                         ? config[@"password"]
	                         : nil;
	NSString* domain = [config[@"domain"] isKindOfClass:[NSString class]] ? config[@"domain"] : nil;
	const BOOL adminSession = [config[@"adminSession"] respondsToSelector:@selector(boolValue)]
	                              ? [config[@"adminSession"] boolValue]
	                              : NO;
	const BOOL ignoreCertificate = [config[@"ignoreCertificate"] respondsToSelector:@selector(boolValue)]
	                                   ? [config[@"ignoreCertificate"] boolValue]
	                                   : NO;
	NSString* securityProtocol =
	    [config[@"securityProtocol"] isKindOfClass:[NSString class]] ? config[@"securityProtocol"]
	                                                                  : @"auto";
	const NSNumber* desktopWidth = [config[@"desktopWidth"] isKindOfClass:[NSNumber class]]
	                                   ? config[@"desktopWidth"]
	                                   : @1280;
	const NSNumber* desktopHeight = [config[@"desktopHeight"] isKindOfClass:[NSNumber class]]
	                                    ? config[@"desktopHeight"]
	                                    : @720;

	freerdp* instance = freerdp_new();
	if (!instance)
	{
		*errorMessage = @"Failed to allocate FreeRDP instance";
		return FALSE;
	}

	instance->ContextSize = sizeof(MidsceneRdpContext);
	instance->ContextNew = MidsceneContextNew;
	instance->ContextFree = MidsceneContextFree;
	instance->PreConnect = MidscenePreConnect;
	instance->PostConnect = MidscenePostConnect;

	if (ignoreCertificate)
	{
		instance->VerifyCertificateEx = MidsceneVerifyCertificateEx;
		instance->VerifyChangedCertificateEx = MidsceneVerifyChangedCertificateEx;
	}

	if (!freerdp_context_new(instance))
	{
		freerdp_free(instance);
		*errorMessage = @"Failed to initialize FreeRDP context";
		return FALSE;
	}

	rdpSettings* settings = instance->context->settings;
	BOOL configured = TRUE;
	configured = configured &&
	             freerdp_settings_set_string(settings, FreeRDP_ServerHostname,
	                                         host.UTF8String);
	configured = configured &&
	             freerdp_settings_set_uint32(settings, FreeRDP_ServerPort,
	                                         portNumber.unsignedIntValue);
	configured =
	    configured &&
	    freerdp_settings_set_uint32(settings, FreeRDP_DesktopWidth,
	                                desktopWidth.unsignedIntValue);
	configured =
	    configured &&
	    freerdp_settings_set_uint32(settings, FreeRDP_DesktopHeight,
	                                desktopHeight.unsignedIntValue);
	configured =
	    configured &&
	    freerdp_settings_set_uint32(settings, FreeRDP_ColorDepth, 32);
	configured = configured &&
	             freerdp_settings_set_bool(settings, FreeRDP_SoftwareGdi, TRUE);
	configured = configured && freerdp_settings_set_bool(
	                            settings, FreeRDP_SupportGraphicsPipeline, FALSE);
	configured = configured &&
	             freerdp_settings_set_bool(settings, FreeRDP_IgnoreCertificate,
	                                       ignoreCertificate);
	configured = configured &&
	             freerdp_settings_set_bool(settings, FreeRDP_ConsoleSession,
	                                       adminSession);

	if (username.length > 0)
	{
		configured = configured &&
		             freerdp_settings_set_string(settings, FreeRDP_Username,
		                                         username.UTF8String);
	}
	if (password.length > 0)
	{
		configured = configured &&
		             freerdp_settings_set_string(settings, FreeRDP_Password,
		                                         password.UTF8String);
	}
	if (domain.length > 0)
	{
		configured = configured &&
		             freerdp_settings_set_string(settings, FreeRDP_Domain, domain.UTF8String);
	}

	if ([securityProtocol isEqualToString:@"tls"] || [securityProtocol isEqualToString:@"nla"] ||
	    [securityProtocol isEqualToString:@"rdp"])
	{
		configured =
		    configured &&
		    freerdp_settings_set_bool(settings, FreeRDP_TlsSecurity,
		                              [securityProtocol isEqualToString:@"tls"]);
		configured =
		    configured &&
		    freerdp_settings_set_bool(settings, FreeRDP_NlaSecurity,
		                              [securityProtocol isEqualToString:@"nla"]);
		configured =
		    configured &&
		    freerdp_settings_set_bool(settings, FreeRDP_RdpSecurity,
		                              [securityProtocol isEqualToString:@"rdp"]);
	}

	if (!configured)
	{
		freerdp_context_free(instance);
		freerdp_free(instance);
		*errorMessage = @"Failed to configure FreeRDP session settings";
		return FALSE;
	}

	gState.instance = instance;
	gState.mouseX = 0;
	gState.mouseY = 0;

	pthread_mutex_lock(&gState.sessionMutex);
	const BOOL connected = freerdp_connect(instance);
	pthread_mutex_unlock(&gState.sessionMutex);
	if (!connected)
	{
		*errorMessage = [NSString stringWithFormat:@"Failed to connect to RDP server: %@",
		                                         MidsceneLastFreeRdpError()];
		MidsceneDisconnectSession();
		return FALSE;
	}

	NSString* sessionId = [NSUUID UUID].UUIDString;
	gState.sessionId = strdup(sessionId.UTF8String);
	gState.connected = TRUE;
	gState.running = TRUE;

	if (pthread_create(&gState.eventThread, NULL, MidsceneEventThreadMain, NULL) != 0)
	{
		*errorMessage = @"Failed to start RDP event loop thread";
		MidsceneDisconnectSession();
		return FALSE;
	}

	gState.eventThreadStarted = TRUE;
	return TRUE;
}

static NSDictionary* MidsceneConnectedPayload(void)
{
	pthread_mutex_lock(&gState.sessionMutex);
	NSDictionary* sizePayload = MidsceneCurrentSizeLocked();
	pthread_mutex_unlock(&gState.sessionMutex);

	NSString* server = @"";
	if (gState.instance && gState.instance->context && gState.instance->context->settings)
	{
		const char* host =
		    freerdp_settings_get_server_name(gState.instance->context->settings);
		const UINT32 port =
		    freerdp_settings_get_uint32(gState.instance->context->settings, FreeRDP_ServerPort);
		server = [NSString stringWithFormat:@"%s:%u", host ? host : "", port];
	}

	return @{
		@"type" : @"connected",
		@"info" : @{
			@"sessionId" : gState.sessionId ? MidsceneStringFromCString(gState.sessionId) : @"",
			@"server" : server,
			@"size" : sizePayload ?: MidsceneSizePayload(0, 0),
		},
	};
}

static void MidsceneHandleConnect(NSString* requestId, NSDictionary* payload)
{
	if (gState.connected)
	{
		MidsceneSendError(requestId, @"RDP session is already connected", @"already_connected");
		return;
	}

	if (gState.instance)
		MidsceneDisconnectSession();

	NSDictionary* config = payload[@"config"];
	if (![config isKindOfClass:[NSDictionary class]])
	{
		MidsceneSendError(requestId, @"connect.config must be an object", @"invalid_request");
		return;
	}

	NSString* errorMessage = nil;
	if (!MidsceneApplyConnectionConfig(config, &errorMessage))
	{
		MidsceneSendError(requestId, errorMessage, @"connect_failed");
		return;
	}

	MidsceneSendPayload(requestId, MidsceneConnectedPayload());
}

static void MidsceneHandleDisconnect(NSString* requestId)
{
	MidsceneDisconnectSession();
	MidsceneSendOk(requestId);
}

static BOOL MidsceneEnsureConnected(NSString* requestId)
{
	if (!gState.connected || !gState.instance || !gState.instance->context)
	{
		if (gState.lastSessionErrorMessage)
		{
			MidsceneSendError(requestId,
			                  MidsceneStringFromCString(gState.lastSessionErrorMessage),
			                  MidsceneStringFromCString(gState.lastSessionErrorCode));
		}
		else
		{
			MidsceneSendError(requestId, @"RDP session is not connected", @"not_connected");
		}
		return FALSE;
	}

	return TRUE;
}

static void MidsceneHandleSize(NSString* requestId)
{
	if (!MidsceneEnsureConnected(requestId))
		return;

	pthread_mutex_lock(&gState.sessionMutex);
	NSDictionary* sizePayload = MidsceneCurrentSizeLocked();
	pthread_mutex_unlock(&gState.sessionMutex);

	MidsceneSendPayload(requestId, @{
		@"type" : @"size",
		@"size" : sizePayload ?: MidsceneSizePayload(0, 0),
	});
}

static void MidsceneHandleScreenshot(NSString* requestId)
{
	if (!MidsceneEnsureConnected(requestId))
		return;

	NSError* error = nil;
	size_t width = 0;
	size_t height = 0;
	size_t stride = 0;
	pthread_mutex_lock(&gState.sessionMutex);
	NSData* rawFrame = MidsceneCopyFrameLocked(&width, &height, &stride, &error);
	pthread_mutex_unlock(&gState.sessionMutex);

	NSData* pngData = rawFrame
	                      ? MidscenePngDataFromFrame(rawFrame, width, height, stride, &error)
	                      : nil;

	if (!pngData)
	{
		MidsceneSendError(requestId, error.localizedDescription, @"screenshot_failed");
		return;
	}

	NSString* base64Body = [pngData base64EncodedStringWithOptions:0];
	MidsceneSendPayload(requestId, @{
		@"type" : @"screenshot",
		@"base64" : [NSString stringWithFormat:@"data:image/png;base64,%@", base64Body],
	});
}

static void MidsceneHandleMouseMove(NSString* requestId, NSDictionary* payload)
{
	if (!MidsceneEnsureConnected(requestId))
		return;

	if (![payload[@"x"] isKindOfClass:[NSNumber class]] ||
	    ![payload[@"y"] isKindOfClass:[NSNumber class]])
	{
		MidsceneSendError(requestId, @"mouseMove requires numeric x and y", @"invalid_request");
		return;
	}

	pthread_mutex_lock(&gState.sessionMutex);
	BOOL ok = MidsceneMouseMoveLocked((UINT16)[payload[@"x"] unsignedIntValue],
	                                  (UINT16)[payload[@"y"] unsignedIntValue]);
	pthread_mutex_unlock(&gState.sessionMutex);

	if (!ok)
	{
		MidsceneSendError(requestId, MidsceneLastFreeRdpError(), @"mouse_move_failed");
		return;
	}

	MidsceneSendOk(requestId);
}

static void MidsceneHandleMouseButton(NSString* requestId, NSDictionary* payload)
{
	if (!MidsceneEnsureConnected(requestId))
		return;

	NSString* button = payload[@"button"];
	NSString* action = payload[@"action"];
	if (![button isKindOfClass:[NSString class]] || ![action isKindOfClass:[NSString class]])
	{
		MidsceneSendError(requestId, @"mouseButton requires button and action", @"invalid_request");
		return;
	}

	pthread_mutex_lock(&gState.sessionMutex);
	BOOL ok = MidsceneMouseButtonActionLocked(button, action);
	pthread_mutex_unlock(&gState.sessionMutex);

	if (!ok)
	{
		MidsceneSendError(requestId, @"Unsupported mouse button action", @"mouse_button_failed");
		return;
	}

	MidsceneSendOk(requestId);
}

static void MidsceneHandleWheel(NSString* requestId, NSDictionary* payload)
{
	if (!MidsceneEnsureConnected(requestId))
		return;

	NSString* direction = payload[@"direction"];
	NSNumber* amount = [payload[@"amount"] isKindOfClass:[NSNumber class]] ? payload[@"amount"] : nil;
	NSNumber* xValue = [payload[@"x"] isKindOfClass:[NSNumber class]] ? payload[@"x"] : nil;
	NSNumber* yValue = [payload[@"y"] isKindOfClass:[NSNumber class]] ? payload[@"y"] : nil;

	if (![direction isKindOfClass:[NSString class]] || !amount)
	{
		MidsceneSendError(requestId, @"wheel requires direction and amount", @"invalid_request");
		return;
	}

	pthread_mutex_lock(&gState.sessionMutex);
	BOOL ok = MidsceneWheelLocked(direction, amount.integerValue, xValue, yValue);
	pthread_mutex_unlock(&gState.sessionMutex);

	if (!ok)
	{
		MidsceneSendError(requestId, @"Failed to send wheel input", @"wheel_failed");
		return;
	}

	MidsceneSendOk(requestId);
}

static void MidsceneHandleKeyPress(NSString* requestId, NSDictionary* payload)
{
	if (!MidsceneEnsureConnected(requestId))
		return;

	NSString* keyName = payload[@"keyName"];
	if (![keyName isKindOfClass:[NSString class]] || keyName.length == 0)
	{
		MidsceneSendError(requestId, @"keyPress requires keyName", @"invalid_request");
		return;
	}

	pthread_mutex_lock(&gState.sessionMutex);
	BOOL ok = MidsceneKeyPressLocked(keyName);
	pthread_mutex_unlock(&gState.sessionMutex);

	if (!ok)
	{
		MidsceneSendError(requestId,
		                  [NSString stringWithFormat:@"Unsupported keyPress value: %@", keyName],
		                  @"keypress_failed");
		return;
	}

	MidsceneSendOk(requestId);
}

static void MidsceneHandleTypeText(NSString* requestId, NSDictionary* payload)
{
	if (!MidsceneEnsureConnected(requestId))
		return;

	NSString* text = payload[@"text"];
	if (![text isKindOfClass:[NSString class]])
	{
		MidsceneSendError(requestId, @"typeText requires text", @"invalid_request");
		return;
	}

	pthread_mutex_lock(&gState.sessionMutex);
	BOOL ok = TRUE;
	for (NSUInteger index = 0; index < text.length; index++)
	{
		ok = MidsceneUnicodeCharLocked([text characterAtIndex:index]);
		if (!ok)
			break;
	}
	pthread_mutex_unlock(&gState.sessionMutex);

	if (!ok)
	{
		MidsceneSendError(requestId, @"Failed to send unicode keyboard input",
		                  @"type_text_failed");
		return;
	}

	MidsceneSendOk(requestId);
}

static void MidsceneHandleClearInput(NSString* requestId)
{
	if (!MidsceneEnsureConnected(requestId))
		return;

	pthread_mutex_lock(&gState.sessionMutex);
	BOOL ok = MidsceneClearInputLocked();
	pthread_mutex_unlock(&gState.sessionMutex);

	if (!ok)
	{
		MidsceneSendError(requestId, @"Failed to clear the active input field",
		                  @"clear_input_failed");
		return;
	}

	MidsceneSendOk(requestId);
}

static void MidsceneHandleRequest(NSDictionary* request)
{
	NSString* requestId = request[@"id"];
	NSDictionary* payload = request[@"payload"];
	if (![requestId isKindOfClass:[NSString class]] || ![payload isKindOfClass:[NSDictionary class]])
	{
		fprintf(stderr, "Invalid helper request envelope\n");
		fflush(stderr);
		return;
	}

	NSString* type = payload[@"type"];
	if (![type isKindOfClass:[NSString class]])
	{
		MidsceneSendError(requestId, @"payload.type must be a string", @"invalid_request");
		return;
	}

	if ([type isEqualToString:@"connect"])
		MidsceneHandleConnect(requestId, payload);
	else if ([type isEqualToString:@"disconnect"])
		MidsceneHandleDisconnect(requestId);
	else if ([type isEqualToString:@"size"])
		MidsceneHandleSize(requestId);
	else if ([type isEqualToString:@"screenshot"])
		MidsceneHandleScreenshot(requestId);
	else if ([type isEqualToString:@"mouseMove"])
		MidsceneHandleMouseMove(requestId, payload);
	else if ([type isEqualToString:@"mouseButton"])
		MidsceneHandleMouseButton(requestId, payload);
	else if ([type isEqualToString:@"wheel"])
		MidsceneHandleWheel(requestId, payload);
	else if ([type isEqualToString:@"keyPress"])
		MidsceneHandleKeyPress(requestId, payload);
	else if ([type isEqualToString:@"typeText"])
		MidsceneHandleTypeText(requestId, payload);
	else if ([type isEqualToString:@"clearInput"])
		MidsceneHandleClearInput(requestId);
	else
		MidsceneSendError(requestId,
		                  [NSString stringWithFormat:@"Unsupported RDP helper request type: %@",
		                                             type],
		                  @"unsupported_request");
}

int main(void)
{
	@autoreleasepool
	{
		WLog_SetLogLevel(WLog_GetRoot(), WLOG_OFF);

		if (pthread_mutex_init(&gState.sessionMutex, NULL) != 0)
		{
			fprintf(stderr, "Failed to initialize helper mutex\n");
			return 1;
		}
		gState.mutexInitialized = TRUE;

		char* line = NULL;
		size_t lineCapacity = 0;
		ssize_t lineLength = 0;

		while ((lineLength = getline(&line, &lineCapacity, stdin)) != -1)
		{
			@autoreleasepool
			{
				NSData* data = [NSData dataWithBytes:line length:(NSUInteger)lineLength];
				NSError* error = nil;
				id object = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
				if (![object isKindOfClass:[NSDictionary class]])
				{
					fprintf(stderr, "Failed to parse helper request JSON: %s\n",
					        error.localizedDescription.UTF8String);
					fflush(stderr);
					continue;
				}

				MidsceneHandleRequest((NSDictionary*)object);

				if (!gState.connected && !gState.instance)
				{
					NSDictionary* request = (NSDictionary*)object;
					NSDictionary* payload = request[@"payload"];
					if ([payload[@"type"] isEqualToString:@"disconnect"])
						break;
				}
			}
		}

		free(line);
		MidsceneDisconnectSession();

		if (gState.mutexInitialized)
		{
			pthread_mutex_destroy(&gState.sessionMutex);
			gState.mutexInitialized = FALSE;
		}
	}

	return 0;
}
