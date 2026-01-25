package com.deckathon;

import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.fxml.Initializable;
import javafx.scene.control.*;
import javafx.scene.layout.VBox;
import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;

import java.io.*;
import java.net.URL;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;

/**
 * Main controller for the Deckathon Automation GUI.
 * Handles mode selection, configuration, script execution, and log parsing.
 */
public class MainController implements Initializable {

    // Mode selection
    @FXML
    private RadioButton createAccountRadio;
    @FXML
    private RadioButton dropoutRadio;
    @FXML
    private ToggleGroup modeGroup;

    // Credentials (for dropout mode)
    @FXML
    private VBox credentialsBox;
    @FXML
    private TextField netnameField;
    @FXML
    private PasswordField passwordField;

    // API Key options
    @FXML
    private RadioButton builtinApiKeyRadio;
    @FXML
    private RadioButton customApiKeyRadio;
    @FXML
    private ToggleGroup apiKeyGroup;
    @FXML
    private TextField customApiKeyField;

    // Chrome path options
    @FXML
    private RadioButton defaultChromeRadio;
    @FXML
    private RadioButton customChromeRadio;
    @FXML
    private ToggleGroup chromeGroup;
    @FXML
    private TextField customChromeField;

    // Control and status
    @FXML
    private Button startButton;
    @FXML
    private Label stageLabel;
    @FXML
    private TextArea logArea;

    // Credentials display
    @FXML
    private VBox generatedCredentialsBox;
    @FXML
    private Label generatedUsernameLabel;
    @FXML
    private Label generatedPasswordLabel;

    private String projectPath;
    private Process runningProcess;
    private String generatedUsername;
    private String generatedPassword;

    // Patterns for parsing logs
    private static final Pattern STEP_PATTERN = Pattern.compile("STEP (\\d+):?\\s*(.*)");
    private static final Pattern CREDENTIALS_PATTERN = Pattern
            .compile("Credentials:\\s*(\\S+)\\s*\\|\\s*[^|]+\\s*\\|\\s*[^|]+\\s*\\|\\s*(\\S+)");
    private static final Pattern STAGE_KEYWORDS = Pattern.compile(
            "(Connecting|Navigating|Filling|Submitting|Login|OTP|Selecting|Clicking|Payment|Dropout|CAPTCHA|Solving|Complete)",
            Pattern.CASE_INSENSITIVE);

    @Override
    public void initialize(URL location, ResourceBundle resources) {
        // Set up mode toggle listener
        modeGroup.selectedToggleProperty().addListener((obs, oldVal, newVal) -> {
            boolean isDropout = dropoutRadio.isSelected();
            credentialsBox.setVisible(isDropout);
            credentialsBox.setManaged(isDropout);
        });

        // Set up API key toggle listener
        apiKeyGroup.selectedToggleProperty().addListener((obs, oldVal, newVal) -> {
            boolean isCustom = customApiKeyRadio.isSelected();
            customApiKeyField.setDisable(!isCustom);
            if (!isCustom) {
                customApiKeyField.clear();
            }
        });

        // Set up Chrome path toggle listener
        chromeGroup.selectedToggleProperty().addListener((obs, oldVal, newVal) -> {
            boolean isCustom = customChromeRadio.isSelected();
            customChromeField.setDisable(!isCustom);
            if (!isCustom) {
                customChromeField.clear();
            }
        });

        // Initially hide credentials box (Create Account mode is default)
        credentialsBox.setVisible(false);
        credentialsBox.setManaged(false);

        // Initially hide generated credentials
        generatedCredentialsBox.setVisible(false);
        generatedCredentialsBox.setManaged(false);

        // Disable custom fields initially
        customApiKeyField.setDisable(true);
        customChromeField.setDisable(true);
    }

    public void setProjectPath(String path) {
        this.projectPath = path;
        loadEnvFile();
    }

    private void loadEnvFile() {
        try {
            Path envPath = Paths.get(projectPath, ".env");
            if (Files.exists(envPath)) {
                List<String> lines = Files.readAllLines(envPath);
                for (String line : lines) {
                    if (line.startsWith("GEMINI_API_KEY=")) {
                        // API key exists, built-in option is available
                        builtinApiKeyRadio.setText("Use Built-in (from .env)");
                    }
                    if (line.startsWith("CHROME_PATH=")) {
                        String chromePath = line.substring("CHROME_PATH=".length()).trim();
                        if (!chromePath.isEmpty()) {
                            defaultChromeRadio.setText("Use Default: " + truncatePath(chromePath));
                        }
                    }
                }
            }
        } catch (IOException e) {
            appendLog("Warning: Could not read .env file");
        }
    }

    private String truncatePath(String path) {
        if (path.length() > 30) {
            return "..." + path.substring(path.length() - 27);
        }
        return path;
    }

    @FXML
    private void handleStart() {
        // Validate inputs
        if (dropoutRadio.isSelected()) {
            if (netnameField.getText().trim().isEmpty() || passwordField.getText().trim().isEmpty()) {
                showAlert("Validation Error", "Please enter both Netname and Password for dropout mode.");
                return;
            }
        }

        if (customApiKeyRadio.isSelected() && customApiKeyField.getText().trim().isEmpty()) {
            showAlert("Validation Error", "Please enter a custom API key or select 'Use Built-in'.");
            return;
        }

        // Clear previous state
        logArea.clear();
        stageLabel.setText("Starting...");
        generatedCredentialsBox.setVisible(false);
        generatedCredentialsBox.setManaged(false);
        generatedUsername = null;
        generatedPassword = null;

        // Disable start button
        startButton.setDisable(true);
        startButton.setText("Running...");

        // Run the script in a background thread
        new Thread(this::runScript).start();
    }

    private void runScript() {
        try {
            List<String> command = new ArrayList<>();
            command.add("node");

            if (createAccountRadio.isSelected()) {
                command.add("deckathonRegister.js");
            } else {
                command.add("deckathonDropout.js");
                command.add("--netname=" + netnameField.getText().trim());
                command.add("--password=" + passwordField.getText().trim());
            }

            // Add API key if custom
            if (customApiKeyRadio.isSelected()) {
                command.add("--apiKey=" + customApiKeyField.getText().trim());
            }

            // Add Chrome path if custom
            if (customChromeRadio.isSelected() && !customChromeField.getText().trim().isEmpty()) {
                command.add("--chromePath=" + customChromeField.getText().trim());
            }

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(new File(projectPath));
            pb.redirectErrorStream(true);

            runningProcess = pb.start();

            // Read output in real-time
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(runningProcess.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    final String logLine = line;
                    Platform.runLater(() -> processLogLine(logLine));
                }
            }

            int exitCode = runningProcess.waitFor();

            Platform.runLater(() -> {
                if (exitCode == 0) {
                    stageLabel.setText("✓ Complete!");
                    appendLog("\n=== Process completed successfully ===");
                } else {
                    stageLabel.setText("✗ Error occurred");
                    appendLog("\n=== Process exited with code " + exitCode + " ===");
                }

                // Show generated credentials if available
                if (createAccountRadio.isSelected() && generatedUsername != null) {
                    generatedUsernameLabel.setText(generatedUsername);
                    generatedPasswordLabel.setText(generatedPassword);
                    generatedCredentialsBox.setVisible(true);
                    generatedCredentialsBox.setManaged(true);
                }

                startButton.setDisable(false);
                startButton.setText("▶  START");
            });

        } catch (Exception e) {
            Platform.runLater(() -> {
                stageLabel.setText("✗ Error: " + e.getMessage());
                appendLog("Error: " + e.getMessage());
                startButton.setDisable(false);
                startButton.setText("▶  START");
            });
        }
    }

    private void processLogLine(String line) {
        appendLog(line);

        // Check for step pattern
        Matcher stepMatcher = STEP_PATTERN.matcher(line);
        if (stepMatcher.find()) {
            String stepNum = stepMatcher.group(1);
            String stepDesc = stepMatcher.group(2);
            stageLabel.setText("Step " + stepNum + ": " + stepDesc);
            return;
        }

        // Check for credentials pattern (for Create Account mode)
        Matcher credMatcher = CREDENTIALS_PATTERN.matcher(line);
        if (credMatcher.find()) {
            generatedUsername = credMatcher.group(1);
            generatedPassword = credMatcher.group(2);
            return;
        }

        // Check for stage keywords
        Matcher keywordMatcher = STAGE_KEYWORDS.matcher(line);
        if (keywordMatcher.find()) {
            // Extract a meaningful portion of the line
            String stage = line.length() > 50 ? line.substring(0, 47) + "..." : line;
            stageLabel.setText(stage);
        }

        // Check for completion
        if (line.contains("COMPLETE") || line.contains("Done!")) {
            stageLabel.setText("✓ " + line);
        }

        // Check for errors
        if (line.startsWith("ERROR") || line.startsWith("Error:")) {
            stageLabel.setText("✗ " + line);
        }
    }

    private void appendLog(String line) {
        logArea.appendText(line + "\n");
        // Auto-scroll to bottom
        logArea.setScrollTop(Double.MAX_VALUE);
    }

    @FXML
    private void handleCopyUsername() {
        if (generatedUsername != null) {
            copyToClipboard(generatedUsername);
        }
    }

    @FXML
    private void handleCopyPassword() {
        if (generatedPassword != null) {
            copyToClipboard(generatedPassword);
        }
    }

    @FXML
    private void handleCopyBoth() {
        if (generatedUsername != null && generatedPassword != null) {
            copyToClipboard(generatedUsername + " / " + generatedPassword);
        }
    }

    private void copyToClipboard(String text) {
        ClipboardContent content = new ClipboardContent();
        content.putString(text);
        Clipboard.getSystemClipboard().setContent(content);

        // Brief visual feedback
        String originalStage = stageLabel.getText();
        stageLabel.setText("📋 Copied to clipboard!");
        new Thread(() -> {
            try {
                Thread.sleep(1500);
                Platform.runLater(() -> stageLabel.setText(originalStage));
            } catch (InterruptedException ignored) {
            }
        }).start();
    }

    @FXML
    private void handleClearLogs() {
        logArea.clear();
        stageLabel.setText("Ready");
    }

    private void showAlert(String title, String message) {
        Alert alert = new Alert(Alert.AlertType.WARNING);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.setContentText(message);
        alert.showAndWait();
    }
}
