@echo off
SET JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot
SET PATH=%JAVA_HOME%\bin;%PATH%
CALL mvnw.cmd compile
echo EXIT_CODE=%ERRORLEVEL%
