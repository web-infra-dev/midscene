package com.midscene.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Midscene design tokens, taken from the desktop studio so the phone console reads
 * as the same product: brand #1979ff, layered greys for surfaces, and the status
 * colours the studio uses for its badges.
 */
object MidsceneColors {
    val Brand = Color(0xFF1979FF)
    val BrandSoft = Color(0xFFE5F0FF)

    val LightBg = Color(0xFFF6F6F6)
    val LightSurface = Color(0xFFFFFFFF)
    val LightSurfaceMuted = Color(0xFFF2F4F7)
    val LightBorder = Color(0xFFECECEC)
    val LightBorderStrong = Color(0xFFE9ECF3)
    val LightText = Color(0xFF0D0D0D)
    val LightTextSecondary = Color(0xFF474848)
    val LightTextTertiary = Color(0xFF797A7A)

    val DarkBg = Color(0xFF282828)
    val DarkSurface = Color(0xFF2B2B2B)
    val DarkSurfaceMuted = Color(0xFF333333)
    val DarkBorder = Color(0xFF2E2E2E)
    val DarkText = Color(0xFFFFFFFF)
    val DarkTextSecondary = Color(0xFFD0D0D1)
    val DarkTextTertiary = Color(0xFF9DA0A1)

    val Success = Color(0xFF12B981)
    val SuccessSoft = Color(0xFFE5FFF4)
    val SuccessText = Color(0xFF079669)
    val Error = Color(0xFFE13E37)
    val ErrorSoft = Color(0xFFF7ECEB)
}

private val LightScheme = lightColorScheme(
    primary = MidsceneColors.Brand,
    onPrimary = Color.White,
    primaryContainer = MidsceneColors.BrandSoft,
    onPrimaryContainer = MidsceneColors.Brand,
    background = MidsceneColors.LightBg,
    onBackground = MidsceneColors.LightText,
    surface = MidsceneColors.LightSurface,
    onSurface = MidsceneColors.LightText,
    surfaceVariant = MidsceneColors.LightSurfaceMuted,
    onSurfaceVariant = MidsceneColors.LightTextSecondary,
    outline = MidsceneColors.LightBorderStrong,
    outlineVariant = MidsceneColors.LightBorder,
    error = MidsceneColors.Error,
)

private val DarkScheme = darkColorScheme(
    primary = MidsceneColors.Brand,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF1B2C44),
    onPrimaryContainer = Color(0xFFCFE2FF),
    background = MidsceneColors.DarkBg,
    onBackground = MidsceneColors.DarkText,
    surface = MidsceneColors.DarkSurface,
    onSurface = MidsceneColors.DarkText,
    surfaceVariant = MidsceneColors.DarkSurfaceMuted,
    onSurfaceVariant = MidsceneColors.DarkTextSecondary,
    outline = Color(0xFF3A3A3A),
    outlineVariant = MidsceneColors.DarkBorder,
    error = MidsceneColors.Error,
)

/** Generous radii, matching the studio's card and control shapes. */
private val MidsceneShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

private val MidsceneTypography = Typography(
    headlineSmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 22.sp,
        letterSpacing = (-0.2).sp,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        letterSpacing = 0.6.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontSize = 14.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontSize = 11.sp,
    ),
)

@Composable
fun MidsceneTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkScheme else LightScheme,
        shapes = MidsceneShapes,
        typography = MidsceneTypography,
        content = content,
    )
}
