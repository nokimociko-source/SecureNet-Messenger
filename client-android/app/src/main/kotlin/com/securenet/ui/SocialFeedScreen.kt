package com.securenet.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

data class Post(
    val id: String,
    val author: String,
    val content: String,
    val likes: Int,
    val time: String
)

@Composable
fun SocialFeedScreen(posts: List<Post>) {
    Scaffold(
        topBar = {
            SmallTopAppBar(title = { Text("Социальная лента", fontWeight = FontWeight.Bold) })
        }
    ) { padding ->
        LazyColumn(modifier = Modifier.padding(padding)) {
            items(posts) { post ->
                PostCard(post)
            }
        }
    }
}

@Composable
fun PostCard(post: Post) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .padding(4.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(post.author[0].toString(), fontWeight = FontWeight.Bold)
                }
                Spacer(modifier = Modifier.width(8.dp))
                Column {
                    Text(post.author, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Text(post.time, fontSize = 12.sp, color = Color.Gray)
                }
            }
            
            Spacer(modifier = Modifier.height(12.dp))
            Text(post.content, fontSize = 14.sp)
            Spacer(modifier = Modifier.height(12.dp))
            
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { /* Like */ }) {
                    Icon(Icons.Default.Favorite, contentDescription = "Like", tint = Color.Red)
                }
                Text("${post.likes}", fontSize = 14.sp)
                Spacer(modifier = Modifier.width(16.dp))
                IconButton(onClick = { /* Comment */ }) {
                    Icon(Icons.Default.Share, contentDescription = "Comment")
                }
            }
        }
    }
}
