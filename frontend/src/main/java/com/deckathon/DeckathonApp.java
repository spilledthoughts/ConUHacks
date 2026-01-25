package com.deckathon;

import javafx.application.Application;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.image.Image;
import javafx.stage.Stage;

/**
 * Deckathon Automation GUI Application
 * 
 * A user-friendly JavaFX interface for running the Deckathon automation scripts.
 */
public class DeckathonApp extends Application {

    @Override
    public void start(Stage primaryStage) throws Exception {
        FXMLLoader loader = new FXMLLoader(getClass().getResource("/main-view.fxml"));
        Parent root = loader.load();
        
        // Get controller and set the project path
        MainController controller = loader.getController();
        controller.setProjectPath(System.getProperty("user.dir").replace("\\frontend", ""));
        
        Scene scene = new Scene(root, 600, 750);
        scene.getStylesheets().add(getClass().getResource("/styles.css").toExternalForm());
        
        primaryStage.setTitle("Deckathon Automation");
        primaryStage.setScene(scene);
        primaryStage.setResizable(false);
        primaryStage.show();
    }

    public static void main(String[] args) {
        launch(args);
    }
}
