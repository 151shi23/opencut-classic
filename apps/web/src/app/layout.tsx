import { ThemeProvider } from "next-themes";
import "./globals.css";
import "../android/android.css";
import { Toaster } from "../components/ui/sonner";
import { ChangelogNotification } from "@/changelog/components/changelog-notification";
import { TooltipProvider } from "../components/ui/tooltip";
import { baseMetaData } from "./metadata";
import { Inter } from "next/font/google";
import { AndroidBootstrap, AndroidLocalize } from "@/android/adapter";

const siteFont = Inter({ subsets: ["latin"] });

export const metadata = baseMetaData;

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<AndroidBootstrap />
			</head>
			<body className={`${siteFont.className} font-sans antialiased`}>
				<AndroidLocalize />
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					disableTransitionOnChange={true}
				>
					<TooltipProvider>
						<Toaster />
						{children}
					</TooltipProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
